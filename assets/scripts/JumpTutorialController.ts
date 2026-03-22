import {
  _decorator,
  Component,
  Node,
  Prefab,
  instantiate,
  find,
  assetManager,
  tween,
  Tween,
  Vec3,
  input,
  Input,
  EventTouch,
  EventMouse,
  view,
} from 'cc';
import { GamePause, TUTORIAL_JUMP_DONE } from './GamePause';
import { PlayerJump } from './PlayerJump';
import { ObstacleSpawner } from './ObstacleSpawner';

const { ccclass, property } = _decorator;

@ccclass('JumpTutorialController')
export class JumpTutorialController extends Component {
  @property({
    tooltip:
      'Если normalize выключен: полная задержка до паузы туториала (сек). Если normalize включён: это поле не используется — см. tutorialDelayOffsetSec.',
  })
  tutorialDelaySec = 3;

  @property({
    tooltip:
      'Только при normalizeTutorialTimingByWidth: добавить к рассчитанному по геометрии времени (сек). Отрицательное — пауза раньше.',
  })
  tutorialDelayOffsetSec = 0;

  @property({
    tooltip:
      'Если normalizeTutorialTimingByWidth выключен: доп. секунды в альбоме (ширина > высоты). Итог: tutorialDelaySec + это значение.',
  })
  tutorialDelayExtraLandscapeSec = 2.5;

  @property({
    tooltip:
      'Считать паузу туториала так, чтобы первый враг в момент паузы был на фиксированном расстоянии от игрока (учёт ширины экрана и spawn X). Иначе — только tutorialDelaySec + доп. для альбома.',
  })
  normalizeTutorialTimingByWidth = true;

  @property({
    tooltip:
      'При normalize: смещение по X от центра игрока до центра врага в момент паузы (враг правее игрока). Подбирается под «окно» прыжка.',
  })
  tutorialEnemyOffsetFromPlayerXPx = 142;

  @property({ tooltip: 'UUID префаба tapToStart (assets/prefabs/tapToStart.prefab)' })
  tapToStartPrefabUuid = 'e2bb0059-66b2-4c43-b258-5162b82fbbf5';

  @property({ type: Prefab, tooltip: 'Если задан — вместо загрузки по UUID' })
  tapToStartPrefabOverride: Prefab | null = null;

  @property({ tooltip: 'UUID префаба jumpToAvoid (по умолчанию из assets/prefabs/jumpToAvoid.prefab)' })
  jumpTipPrefabUuid = 'da69688b-76af-4304-bd69-7ef15ec9060e';

  @property({ tooltip: 'UUID префаба «руки» (по умолчанию point — можно заменить на руку в инспекторе)' })
  tutorialHandPrefabUuid = 'f970db99-7647-4498-b808-e205110ca67c';

  @property({ type: Prefab, tooltip: 'Если задан — используется вместо загрузки по UUID' })
  jumpTipPrefabOverride: Prefab | null = null;

  @property({ type: Prefab, tooltip: 'Если задан — используется вместо загрузки по UUID' })
  tutorialHandPrefabOverride: Prefab | null = null;

  @property({ tooltip: 'Масштаб «руки» в анимации (пульс от 1 до handPulseScale)' })
  handPulseScale = 1.18;

  @property({ tooltip: 'Полупериод пульса руки (сек)' })
  handPulseHalfPeriodSec = 0.45;

  @property({ tooltip: 'Позиция руки: X (0 = центр Canvas)' })
  tutorialHandPosX = 0;

  @property({ tooltip: 'Позиция руки: Y (меньше — ниже на экране)' })
  tutorialHandPosY = -320;

  private playerNode: Node | null = null;
  private playerJump: PlayerJump | null = null;
  private tipRoot: Node | null = null;
  private handRoot: Node | null = null;
  private tutorialActive = false;
  private jumpTutorialCompleted = false;

  private tapToStartPrefab: Prefab | null = null;
  private jumpTipPrefab: Prefab | null = null;
  private tutorialHandPrefab: Prefab | null = null;

  private tapToStartDone = false;
  private tapToStartUiShown = false;

  public static attach(canvas: Node): void {
    if (!canvas.getComponent(JumpTutorialController)) {
      canvas.addComponent(JumpTutorialController);
    }
  }

  onLoad() {
    this.playerNode = find('player', this.node) ?? find('player');
    this.playerJump = this.playerNode?.getComponent(PlayerJump) ?? null;
    GamePause.setPaused(true);
  }

  start() {
    this.loadPrefabsAsyncAndShowTapToStart();
  }

  public isTutorialCompleted(): boolean {
    return this.jumpTutorialCompleted;
  }

  /** Задержка до паузы туториала: по геометрии первого врага или legacy (сек + альбом). */
  public getEffectiveTutorialDelaySec(): number {
    const spawner = this.node.getComponent(ObstacleSpawner);
    if (spawner) {
      return spawner.computeJumpTutorialDelayFor(this);
    }
    return this.legacyTutorialDelaySec();
  }

  /** Legacy: фиксированные секунды + опция для альбома (без ObstacleSpawner или normalize off). */
  public legacyTutorialDelaySec(): number {
    const vs = view.getVisibleSize();
    const landscape = vs.width > vs.height;
    const extra = landscape ? Math.max(0, this.tutorialDelayExtraLandscapeSec) : 0;
    return this.tutorialDelaySec + extra;
  }

  public requestBeginFromGameClock(): void {
    if (!this.tapToStartDone || this.jumpTutorialCompleted || this.tutorialActive) return;
    if (!this.jumpTipPrefab) return;
    this.beginTutorial();
  }

  onDestroy() {
    this.stopHandTween();
    this.unbindTapToStartInput();
    this.playerNode?.off(TUTORIAL_JUMP_DONE, this.onTutorialJumpDone, this);
  }

  private loadPrefabsAsyncAndShowTapToStart() {
    this.tapToStartPrefab = this.tapToStartPrefabOverride;
    this.jumpTipPrefab = this.jumpTipPrefabOverride;
    this.tutorialHandPrefab = this.tutorialHandPrefabOverride;

    let pending = 0;
    const step = () => {
      pending--;
      if (pending <= 0) this.onTapToStartPrefabsReady();
    };

    if (!this.tapToStartPrefab && this.tapToStartPrefabUuid) {
      pending++;
      assetManager.loadAny<Prefab>({ uuid: this.tapToStartPrefabUuid }, (err, asset) => {
        if (!err && asset) this.tapToStartPrefab = asset;
        step();
      });
    }
    if (!this.jumpTipPrefab && this.jumpTipPrefabUuid) {
      pending++;
      assetManager.loadAny<Prefab>({ uuid: this.jumpTipPrefabUuid }, (err, asset) => {
        if (!err && asset) this.jumpTipPrefab = asset;
        step();
      });
    }
    if (!this.tutorialHandPrefab && this.tutorialHandPrefabUuid) {
      pending++;
      assetManager.loadAny<Prefab>({ uuid: this.tutorialHandPrefabUuid }, (err, asset) => {
        if (!err && asset) this.tutorialHandPrefab = asset;
        step();
      });
    }

    if (pending === 0) {
      this.onTapToStartPrefabsReady();
    }
  }

  private onTapToStartPrefabsReady() {
    if (this.tapToStartDone || this.tapToStartUiShown) return;
    if (!this.tapToStartPrefab) {
      this.finishTapToStartWithoutUi();
      return;
    }
    this.showTapToStartUi();
  }

  private finishTapToStartWithoutUi() {
    this.tapToStartDone = true;
    GamePause.setPaused(false);
  }

  private showTapToStartUi() {
    if (this.tapToStartUiShown) return;
    this.tapToStartUiShown = true;

    const tip = instantiate(this.tapToStartPrefab!);
    tip.parent = this.node;
    tip.setPosition(new Vec3(0, 50, 0));
    this.tipRoot = tip;

    if (this.tutorialHandPrefab) {
      const hand = instantiate(this.tutorialHandPrefab);
      hand.parent = this.node;
      hand.setPosition(new Vec3(this.tutorialHandPosX, this.tutorialHandPosY, 0));
      this.handRoot = hand;

      const base = hand.scale.clone();
      const up = new Vec3(base.x * this.handPulseScale, base.y * this.handPulseScale, base.z);
      tween(hand)
        .repeatForever(
          tween(hand)
            .to(this.handPulseHalfPeriodSec, { scale: up }, { easing: 'sineInOut' })
            .to(this.handPulseHalfPeriodSec, { scale: base }, { easing: 'sineInOut' })
        )
        .start();
    }

    input.on(Input.EventType.TOUCH_START, this.onTapToStartInput, this);
    input.on(Input.EventType.MOUSE_DOWN, this.onTapToStartMouse, this);
  }

  private unbindTapToStartInput() {
    input.off(Input.EventType.TOUCH_START, this.onTapToStartInput, this);
    input.off(Input.EventType.MOUSE_DOWN, this.onTapToStartMouse, this);
  }

  private onTapToStartInput(_e: EventTouch) {
    this.completeTapToStart();
  }

  private onTapToStartMouse(_e: EventMouse) {
    this.completeTapToStart();
  }

  private completeTapToStart() {
    if (this.tapToStartDone) return;
    this.tapToStartDone = true;
    this.stopHandTween();
    this.unbindTapToStartInput();
    if (this.tipRoot && (this.tipRoot as any).isValid !== false) {
      this.tipRoot.destroy();
    }
    if (this.handRoot && (this.handRoot as any).isValid !== false) {
      this.handRoot.destroy();
    }
    this.tipRoot = null;
    this.handRoot = null;
    GamePause.setPaused(false);
  }

  private beginTutorial() {
    if (this.jumpTutorialCompleted || this.tutorialActive) return;
    if (!this.jumpTipPrefab) return;

    if (!this.playerJump || !this.playerNode) {
      this.playerNode = find('player', this.node) ?? find('player');
      this.playerJump = this.playerNode?.getComponent(PlayerJump) ?? null;
    }
    if (!this.playerJump) return;

    this.tutorialActive = true;
    GamePause.setPaused(true);
    this.playerJump.setTutorialPause(true);
    this.playerJump.setJumpInputEnabled(true);

    this.showTutorialUi();

    this.playerNode?.on(TUTORIAL_JUMP_DONE, this.onTutorialJumpDone, this);
  }

  private showTutorialUi() {
    if (!this.jumpTipPrefab) return;

    const tip = instantiate(this.jumpTipPrefab);
    tip.parent = this.node;
    tip.setPosition(new Vec3(0, 50, 0));
    this.tipRoot = tip;

    if (this.tutorialHandPrefab) {
      const hand = instantiate(this.tutorialHandPrefab);
      hand.parent = this.node;
      hand.setPosition(new Vec3(this.tutorialHandPosX, this.tutorialHandPosY, 0));
      this.handRoot = hand;

      const base = hand.scale.clone();
      const up = new Vec3(base.x * this.handPulseScale, base.y * this.handPulseScale, base.z);
      tween(hand)
        .repeatForever(
          tween(hand)
            .to(this.handPulseHalfPeriodSec, { scale: up }, { easing: 'sineInOut' })
            .to(this.handPulseHalfPeriodSec, { scale: base }, { easing: 'sineInOut' })
        )
        .start();
    }
  }

  private stopHandTween() {
    if (this.handRoot) {
      Tween.stopAllByTarget(this.handRoot);
    }
  }

  private onTutorialJumpDone() {
    if (!this.tutorialActive) return;

    this.tutorialActive = false;
    this.jumpTutorialCompleted = true;

    GamePause.setPaused(false);
    this.playerJump?.setTutorialPause(false);
    this.playerJump?.setJumpInputEnabled(true);

    this.stopHandTween();

    if (this.tipRoot && (this.tipRoot as any).isValid !== false) {
      this.tipRoot.destroy();
    }
    if (this.handRoot && (this.handRoot as any).isValid !== false) {
      this.handRoot.destroy();
    }
    this.tipRoot = null;
    this.handRoot = null;

    this.playerNode?.off(TUTORIAL_JUMP_DONE, this.onTutorialJumpDone, this);
  }
}
