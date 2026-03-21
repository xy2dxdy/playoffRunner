import {
  _decorator,
  Component,
  Node,
  Prefab,
  instantiate,
  Label,
  UITransform,
  UIOpacity,
  Vec3,
  tween,
  Tween,
} from 'cc';
import { RunnerWorldScroller } from './RunnerWorldScroller';
import { GamePause } from './GamePause';
import { WinPresenter } from './WinPresenter';
const { ccclass, property } = _decorator;

type ActiveCollectible = {
  worldX: number;
  flying: boolean;
};

@ccclass('CollectibleSpawner')
export class CollectibleSpawner extends Component {
  @property({ type: RunnerWorldScroller, tooltip: 'Скроллер мира — движение как у фона' })
  worldScroller: RunnerWorldScroller | null = null;

  @property({
    type: [Prefab],
    tooltip: 'Префабы подбора (например dollar и paypall) — каждый спавн выбирается случайно',
  })
  collectiblePrefabs: Prefab[] = [];

  @property({
    type: [Number],
    tooltip: 'Секунды от старта сцены, когда появляется каждый предмет (порядок как у Y)',
  })
  spawnTimesSec: number[] = [];

  @property({
    type: [Number],
    tooltip: 'Смещение по Y в px экрана от линии земли (как деревья). Длина может быть 1 — тогда одно значение для всех',
  })
  spawnYOffsetsPx: number[] = [0];

  @property({ type: Node, tooltip: 'Игрок' })
  playerNode: Node | null = null;

  @property({
    type: Node,
    tooltip: 'Куда летит иконка при подборе (якорь на UI, например слот счёта)',
  })
  flyTargetNode: Node | null = null;

  @property({ type: Label, tooltip: 'Текст счёта долларов (число обновляется при прилёте)' })
  dollarScoreLabel: Label | null = null;

  @property({ tooltip: 'Мин. прибавка к счёту за одну подобранную монету' })
  scorePerCollectMin = 20;

  @property({ tooltip: 'Макс. прибавка к счёту за одну подобранную монету' })
  scorePerCollectMax = 30;

  @property({ tooltip: 'Насколько увеличить цель при прилёте (1.06 = +6%)' })
  flyTargetPulseScale = 1.06;

  @property({ tooltip: 'Длительность «надува» цели (сек)' })
  flyTargetPulseUpSec = 0.07;

  @property({ tooltip: 'Длительность возврата скейла цели (сек)' })
  flyTargetPulseDownSec = 0.14;

  @property({ tooltip: 'Отступ справа от края экрана при спавне (px)' })
  spawnRightMarginPx = 80;

  @property({ tooltip: 'Длительность полёта к цели (сек)' })
  flyDurationSec = 0.55;

  @property({ tooltip: 'Масштаб в конце полёта' })
  flyEndScale = 0.2;

  @property({ tooltip: 'Обороты по Z за время полёта' })
  flySpins = 2.5;

  @property({ tooltip: 'Сужение хитбокса игрока по X с каждой стороны (px)' })
  playerHitboxShrinkX = 15;

  @property({ tooltip: 'Сужение хитбокса игрока по Y с каждой стороны (px)' })
  playerHitboxShrinkY = 15;

  @property({ tooltip: 'Сужение хитбокса предмета по X с каждой стороны (px)' })
  collectibleHitboxShrinkX = 8;

  @property({ tooltip: 'Сужение хитбокса предмета по Y с каждой стороны (px)' })
  collectibleHitboxShrinkY = 8;

  @property({
    type: [Prefab],
    tooltip: 'Строки из assets/prefabs/strings — случайная при срабатывании (не на первые N подборов)',
  })
  stringPopupPrefabs: Prefab[] = [];

  @property({
    type: Node,
    tooltip: 'Родитель для всплывающей строки (по умолчанию — parent flyTargetNode)',
  })
  stringPopupParent: Node | null = null;

  @property({ tooltip: 'Не показывать строку на первые столько успешных подборов' })
  stringPopupSkipFirstPickups = 2;

  @property({ tooltip: 'Вероятность показа после порога (0–1)' })
  stringPopupChance = 0.45;

  @property({ tooltip: 'Длительность появления по скейлу (сек)' })
  stringPopupScaleInSec = 0.28;

  @property({ tooltip: 'Пауза перед уходом вверх (сек)' })
  stringPopupHoldSec = 2;

  @property({ tooltip: 'Длительность движения вверх и затухания (сек)' })
  stringPopupFloatSec = 0.75;

  @property({ tooltip: 'Смещение вверх за фазу ухода (px в локали родителя)' })
  stringPopupFloatUpPx = 140;

  @property({ tooltip: 'Доп. смещение от центра экрана по X (px в локали родителя)' })
  stringPopupOffsetX = 0;

  @property({ tooltip: 'Доп. смещение от центра экрана по Y (px в локали родителя)' })
  stringPopupOffsetY = 0;

  private timeSinceStart = 0;
  private spawnIndex = 0;
  private active = new Map<Node, ActiveCollectible>();
  private dollarTotal = 0;
  private successfulPickups = 0;
  private flyTargetBaseScale: Vec3 | null = null;
  private warnedNoLayer = false;
  /** Пока на экране — новый string popup не спавним */
  private stringPopupNode: Node | null = null;

  start() {
    if (this.flyTargetNode) {
      this.flyTargetBaseScale = this.flyTargetNode.scale.clone();
    }
    this.refreshDollarLabel();
  }

  update(dt: number) {
    if (GamePause.paused) return;

    const scroller = this.worldScroller;
    if (!scroller) return;

    const layer = scroller.getCollectibleLayer();
    if (!layer) {
      if (!this.warnedNoLayer) {
        this.warnedNoLayer = true;
        console.warn('[CollectibleSpawner] Нет collectibleLayer — проверьте RunnerWorldScroller (фон и objectPrefabs).');
      }
      return;
    }

    this.timeSinceStart += dt;

    this.trySpawnScheduled(layer, scroller);

    const wox = scroller.getWorldOffsetX();
    const leftEdge = scroller.getLeftEdge();
    const margin = scroller.getDespawnMarginLocal();

    const toRemove: Node[] = [];
    for (const [node, data] of this.active.entries()) {
      if (data.flying) continue;

      const canvasX = data.worldX - wox;
      node.setPosition(new Vec3(canvasX, node.position.y, node.position.z));

      if (canvasX < leftEdge - margin) {
        toRemove.push(node);
      }
    }

    for (const n of toRemove) {
      this.active.delete(n);
      n.destroy();
    }

    this.checkPickups(scroller);
  }

  private trySpawnScheduled(layer: Node, scroller: RunnerWorldScroller) {
    const times = this.spawnTimesSec;
    if (!times || times.length === 0) return;
    if (this.collectiblePrefabs.length === 0) return;

    while (this.spawnIndex < times.length && this.timeSinceStart >= times[this.spawnIndex]) {
      const prefab = this.pickRandomPrefab();
      if (!prefab) break;

      const node = instantiate(prefab);
      node.parent = layer;

      const yOff = this.getYForSpawnIndex(this.spawnIndex);
      const centerY = scroller.getCollectibleCenterY(node, yOff);
      const worldX = scroller.getSpawnWorldXAtRightEdge(this.spawnRightMarginPx);

      const canvasX = worldX - scroller.getWorldOffsetX();
      node.setPosition(new Vec3(canvasX, centerY, node.position.z));

      this.active.set(node, { worldX, flying: false });
      this.spawnIndex++;
    }
  }

  private getYForSpawnIndex(i: number): number {
    const ys = this.spawnYOffsetsPx;
    if (!ys || ys.length === 0) return 0;
    if (i < ys.length) return ys[i];
    return ys[ys.length - 1];
  }

  private pickRandomPrefab(): Prefab | null {
    const arr = this.collectiblePrefabs;
    if (arr.length === 0) return null;
    const idx = Math.floor(Math.random() * arr.length);
    return arr[idx];
  }

  private checkPickups(scroller: RunnerWorldScroller) {
    if (!this.playerNode || !this.flyTargetNode) return;

    const playerUi = this.playerNode.getComponent(UITransform);
    if (!playerUi) return;

    const pPos = this.playerNode.worldPosition;
    const pW = playerUi.contentSize.width * Math.abs(this.playerNode.scale.x);
    const pH = playerUi.contentSize.height * Math.abs(this.playerNode.scale.y);
    const pLeft = pPos.x - pW / 2 + this.playerHitboxShrinkX;
    const pRight = pPos.x + pW / 2 - this.playerHitboxShrinkX;
    const pBottom = pPos.y - pH / 2 + this.playerHitboxShrinkY;
    const pTop = pPos.y + pH / 2 - this.playerHitboxShrinkY;

    for (const [node, data] of this.active.entries()) {
      if (data.flying) continue;

      const obsUi = node.getComponent(UITransform);
      if (!obsUi) continue;

      const oPos = node.worldPosition;
      const oW = obsUi.contentSize.width * Math.abs(node.scale.x);
      const oH = obsUi.contentSize.height * Math.abs(node.scale.y);
      const oLeft = oPos.x - oW / 2 + this.collectibleHitboxShrinkX;
      const oRight = oPos.x + oW / 2 - this.collectibleHitboxShrinkX;
      const oBottom = oPos.y - oH / 2 + this.collectibleHitboxShrinkY;
      const oTop = oPos.y + oH / 2 - this.collectibleHitboxShrinkY;

      if (pLeft < oRight && pRight > oLeft && pBottom < oTop && pTop > oBottom) {
        this.startFlyToTarget(node, scroller);
      }
    }
  }

  private startFlyToTarget(node: Node, scroller: RunnerWorldScroller) {
    const rec = this.active.get(node);
    if (!rec || rec.flying) return;
    rec.flying = true;

    const target = this.flyTargetNode!;
    const parent = target.parent;
    if (!parent) {
      this.finishCollect(node, false);
      return;
    }

    const parentUi = parent.getComponent(UITransform);
    if (!parentUi) {
      this.finishCollect(node, false);
      return;
    }

    const startWorld = node.worldPosition.clone();
    node.setParent(parent);
    node.setWorldPosition(startWorld);
    node.setSiblingIndex(parent.children.length - 1);

    const endLocal = new Vec3();
    parentUi.convertToNodeSpaceAR(target.worldPosition, endLocal);

    const startEuler = node.eulerAngles.clone();
    const endEuler = new Vec3(startEuler.x, startEuler.y, startEuler.z + 360 * this.flySpins);
    const startScale = node.scale.clone();
    const endScale = new Vec3(
      this.flyEndScale * Math.sign(startScale.x || 1),
      this.flyEndScale * Math.sign(startScale.y || 1),
      startScale.z
    );

    Tween.stopAllByTarget(node);

    tween(node)
      .parallel(
        tween(node).to(
          this.flyDurationSec,
          { position: endLocal },
          { easing: 'quadInOut' }
        ),
        tween(node).to(this.flyDurationSec, { eulerAngles: endEuler }, { easing: 'quadOut' }),
        tween(node).to(this.flyDurationSec, { scale: endScale }, { easing: 'quadIn' })
      )
      .call(() => this.finishCollect(node, true))
      .start();
  }

  private randomScoreIncrement(): number {
    const lo = Math.min(this.scorePerCollectMin, this.scorePerCollectMax);
    const hi = Math.max(this.scorePerCollectMin, this.scorePerCollectMax);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  private refreshDollarLabel() {
    if (this.dollarScoreLabel) {
      this.dollarScoreLabel.string = `$${this.dollarTotal}`;
    }
  }

  private maybeShowPickupStringPopup() {
    const prefabs = this.stringPopupPrefabs;
    if (!prefabs.length) return;
    if (this.successfulPickups <= this.stringPopupSkipFirstPickups) return;
    if (Math.random() > this.stringPopupChance) return;

    if (this.stringPopupNode?.isValid) return;
    this.stringPopupNode = null;

    const anchor = this.flyTargetNode ?? this.playerNode ?? this.node;
    const canvas = WinPresenter.getCanvasFromNode(anchor);
    if (!canvas) return;

    const centerWorld = this.getCanvasCenterWorld(canvas);
    if (!centerWorld) return;

    const parent =
      this.stringPopupParent ?? this.flyTargetNode?.parent ?? this.playerNode?.parent;
    if (!parent) return;

    const prefab = prefabs[Math.floor(Math.random() * prefabs.length)];
    if (!prefab) return;

    const node = instantiate(prefab);
    const parentUi = parent.getComponent(UITransform);
    if (!parentUi) {
      node.destroy();
      return;
    }

    node.setParent(parent);
    node.setSiblingIndex(parent.children.length - 1);
    this.stringPopupNode = node;

    const local = new Vec3();
    parentUi.convertToNodeSpaceAR(centerWorld, local);
    local.x += this.stringPopupOffsetX;
    local.y += this.stringPopupOffsetY;
    node.setPosition(local);

    const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    opacity.opacity = 255;

    const endScale = node.scale.clone();
    const sx = Math.sign(endScale.x) || 1;
    const sy = Math.sign(endScale.y) || 1;
    const fromScale = new Vec3(0.02 * sx, 0.02 * sy, endScale.z);
    node.setScale(fromScale);

    Tween.stopAllByTarget(node);
    Tween.stopAllByTarget(opacity);

    const endPos = local.clone();
    endPos.y += this.stringPopupFloatUpPx;

    const floatSec = this.stringPopupFloatSec;

    tween(node)
      .to(this.stringPopupScaleInSec, { scale: endScale }, { easing: 'backOut' })
      .delay(this.stringPopupHoldSec)
      .call(() => {
        let partsDone = 0;
        const onFloatDone = () => {
          partsDone++;
          if (partsDone >= 2 && node.isValid) {
            if (this.stringPopupNode === node) this.stringPopupNode = null;
            node.destroy();
          }
        };
        tween(node)
          .to(floatSec, { position: endPos }, { easing: 'quadOut' })
          .call(onFloatDone)
          .start();
        tween(opacity)
          .to(floatSec, { opacity: 0 }, { easing: 'quadOut' })
          .call(onFloatDone)
          .start();
      })
      .start();
  }

  /** Геометрический центр Canvas в мировых координатах (для UI по центру экрана). */
  private getCanvasCenterWorld(canvas: Node): Vec3 | null {
    const ui = canvas.getComponent(UITransform);
    if (!ui) return null;
    const w = ui.contentSize.width;
    const h = ui.contentSize.height;
    const ax = ui.anchorX;
    const ay = ui.anchorY;
    const localCenter = new Vec3((0.5 - ax) * w, (0.5 - ay) * h, 0);
    const out = new Vec3();
    ui.convertToWorldSpaceAR(localCenter, out);
    return out;
  }

  private pulseFlyTarget() {
    const n = this.flyTargetNode;
    if (!n) return;

    if (!this.flyTargetBaseScale) {
      this.flyTargetBaseScale = n.scale.clone();
    }
    const base = this.flyTargetBaseScale;
    const k = this.flyTargetPulseScale;
    const up = new Vec3(base.x * k, base.y * k, base.z);

    Tween.stopAllByTarget(n);
    tween(n)
      .to(this.flyTargetPulseUpSec, { scale: up }, { easing: 'quadOut' })
      .to(this.flyTargetPulseDownSec, { scale: base.clone() }, { easing: 'quadOut' })
      .start();
  }

  private finishCollect(node: Node, creditScore: boolean) {
    this.active.delete(node);

    if (creditScore) {
      this.dollarTotal += this.randomScoreIncrement();
      this.successfulPickups++;
      this.refreshDollarLabel();
      this.pulseFlyTarget();
      this.maybeShowPickupStringPopup();
    }

    if (node && (node as any).isValid !== false) {
      node.destroy();
    }
  }

  public getDollarTotal(): number {
    return this.dollarTotal;
  }

  public getCollectedCount(): number {
    return this.successfulPickups;
  }

  /**
   * Вызывается из RunnerWorldScroller.reflowFromCanvasSize: монеты хранят worldX отдельно от objectsWorldX,
   * иначе при повороте/ресайзе не применяется deltaBg и пересчёт при смене worldScale — монета «уезжает» по X.
   */
  public syncScrollWorldXAfterReflow(deltaBg: number, prevWorldScale: number, newWorldScale: number) {
    const scroller = this.worldScroller;
    if (!scroller) return;

    const wox = scroller.getWorldOffsetX();
    const scaleChanged =
      prevWorldScale !== newWorldScale && prevWorldScale !== 0 && newWorldScale !== 0;
    const ratio = scaleChanged ? prevWorldScale / newWorldScale : 1;

    for (const [, data] of this.active.entries()) {
      if (data.flying) continue;
      let wx = data.worldX + deltaBg;
      if (ratio !== 1) {
        wx = wox + (wx - wox) * ratio;
      }
      data.worldX = wx;
    }
  }
}
