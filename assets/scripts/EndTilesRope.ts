import { _decorator, Component, Node, Sprite, UITransform, Vec3, view } from 'cc';
import { GamePause } from './GamePause';
import { WinPresenter } from './WinPresenter';

const { ccclass, property } = _decorator;

type SwayKind = 'whole' | 'torn';

type SwayEntry = {
  node: Node;
  layoutPos: Vec3;
  layoutEuler: Vec3;
  /** whole — целые нитки (thread1/2) и полосы 01/02; torn — нитки после разрыва (threadTorn* и вложения) */
  kind: SwayKind;
};

@ccclass('EndTilesRope')
export class EndTilesRope extends Component {
  @property({
    tooltip:
      'Растянуть ленту по видимой ширине экрана (9-slice на спрайте корня + сдвиг ниток к левому краю)',
  })
  stretchRibbonToViewport = true;

  @property({ tooltip: 'Доля ширины видимой области (1 = на всю ширину в локальных юнитах мира)' })
  ribbonViewportWidthFraction = 1;

  @property({ tooltip: 'Уменьшить целевую ширину ленты с каждой стороны (локальные юниты мира)' })
  ribbonHorizontalInsetLocal = 0;

  @property({
    tooltip: 'Мин. ширина ленты (px в локали мира). 0 = как в префабе при первом применении',
  })
  ribbonMinWidthLocal = 0;

  @property({ tooltip: 'Покачивание ниток и полосок ленты (висящий вид)' })
  swayEnabled = true;

  @property({
    tooltip: 'До разрыва: целые нитки thread1/2 и полосы 01/02 — поворот по Z (градусы)',
  })
  swayRotationDeg = 0.15;

  @property({
    tooltip: 'До разрыва: доп. сдвиг по Y (px). После разрыва порванные только вращаются, без сдвига',
  })
  swayVerticalPx = 0;

  @property({ tooltip: 'Частота ветра для whole (колебаний в секунду)' })
  swayWindHz = 5;

  @property({
    tooltip: 'После разрыва: амплитуда вращения порванных ниток по Z (градусы), без смещения позиции',
  })
  swayTornRotationDeg = 3.5;

  @property({
    tooltip: 'После разрыва: частота вращения порванных ниток (Гц); 0 = как swayWindHz',
  })
  swayTornWindHz = 6;

  @property({
    tooltip:
      'После разрыва: фазовый сдвиг по X (как у целых). 0 — все куски в одной фазе, только вращение',
  })
  swayTornLagPerLocalX = 0;

  @property({
    tooltip: 'Фазовый сдвиг по локальному X узла (рад на 1 единицу) — волна ветра вдоль ленты',
  })
  swayLagPerLocalX = 0.008;

  @property({
    tooltip: 'Вторая гармоника по углу; меньше — мягче, без рывков',
  })
  swayRotationHarmonic = 0.025;

  @property({
    tooltip:
      'Глубина поддерева порванных ниток: висящие спрайты внутри threadTorn* тоже болтаются отдельно',
  })
  swayTornSubtreeDepth = 4;

  @property({
    tooltip: 'Усиление для корня threadTorn* (прямой ребёнок endTiles)',
  })
  swayTornRootAmp = 1.35;

  @property({
    tooltip: 'Усиление для кусков внутри порванных групп (не прямые дети корня endTiles)',
  })
  swayTornPieceAmp = 1.7;

  @property({ type: Node, tooltip: 'Игрок (если пусто — из EndTilesSpawner.init)' })
  playerNode: Node | null = null;

  @property({ tooltip: 'Целая левая нитка (скрывается при разрыве)' })
  leftThreadGroupName = 'thread1';

  @property({ tooltip: 'Целая правая нитка' })
  rightThreadGroupName = 'thread2';

  @property({ tooltip: 'Порванная левая нитка (показывается при разрыве)' })
  leftTornName = 'threadTorn1';

  @property({ tooltip: 'Порванная правая нитка' })
  rightTornName = 'threadTorn2';

  @property({ tooltip: 'Сужение хитбокса игрока по X' })
  playerHitboxShrinkX = 15;

  @property({ tooltip: 'Сужение хитбокса игрока по Y' })
  playerHitboxShrinkY = 15;

  @property({
    tooltip:
      'После разрыва нитки — пауза/packshot, когда правый край финиша левее левого края игрока ещё на столько px',
  })
  runPastFinishMarginPx = 48;

  @property({
    tooltip: 'Если за это время линия так и не уехала — всё равно пауза и packshot',
  })
  maxWaitPastFinishSec = 0.15;

  private ropeTorn = false;
  private gameStopped = false;
  private awaitingRunPast = false;
  private waitPastTimer = 0;
  private playerRef: Node | null = null;

  private _ribbonLayoutQueued = false;
  private _authoredRibbonWidth = 0;

  private _swayBases: SwayEntry[] = [];
  private _swayTime = 0;
  /** Общая фаза ветра для всего префаба (узлы не расходятся в разные стороны) */
  private _windPhase0 = 0;

  onLoad() {
    this._windPhase0 = Math.random() * Math.PI * 2;
    view.on('canvas-resize', this.queueRibbonLayout, this);
    this.queueRibbonLayout();
  }

  onDestroy() {
    view.off('canvas-resize', this.queueRibbonLayout, this);
  }

  init(player: Node | null) {
    this.playerRef = player ?? this.playerNode;
    this.queueRibbonLayout();
  }

  private queueRibbonLayout() {
    if (this._ribbonLayoutQueued) return;
    this._ribbonLayoutQueued = true;
    this.scheduleOnce(() => {
      this._ribbonLayoutQueued = false;
      this.applyFlexibleRibbonLayout();
    }, 0);
  }

  /**
   * Лента — sliced-спрайт на корне; при увеличении ширины сдвигаем дочерние узлы влево на половину
   * прироста, чтобы нитки остались у левого края (якорь корня 0.5, 0.5).
   * Позиции для покачивания храним отдельно от анимации, чтобы не смешивать с dx.
   */
  private applyFlexibleRibbonLayout() {
    const ui = this.node.getComponent(UITransform);
    const sprite = this.node.getComponent(Sprite);
    if (!ui || !sprite) {
      this.ensureSwayBases();
      return;
    }

    if (!this.stretchRibbonToViewport) {
      this.ensureSwayBases();
      return;
    }

    if (this._authoredRibbonWidth <= 0) {
      this._authoredRibbonWidth = ui.contentSize.width;
    }
    const minW = this.ribbonMinWidthLocal > 0 ? this.ribbonMinWidthLocal : this._authoredRibbonWidth;

    const worldScale = this.getWorldRootScaleX();
    const vs = view.getVisibleSize();
    const localVisibleW = worldScale > 1e-6 ? vs.width / worldScale : vs.width;
    const inset = this.ribbonHorizontalInsetLocal * 2;
    const targetW = Math.max(
      minW,
      localVisibleW * this.ribbonViewportWidthFraction - inset,
    );

    const curW = ui.contentSize.width;
    const h = ui.contentSize.height;

    if (Math.abs(targetW - curW) < 0.5) {
      this.ensureSwayBases();
      return;
    }

    const dx = -(targetW - curW) / 2;

    if (this._swayBases.length > 0) {
      for (const e of this._swayBases) {
        if (e.node.parent === this.node) {
          e.layoutPos.x += dx;
        }
        e.node.setPosition(e.layoutPos.x, e.layoutPos.y, e.layoutPos.z);
        e.node.setRotationFromEuler(e.layoutEuler.x, e.layoutEuler.y, e.layoutEuler.z);
      }
    } else {
      for (const ch of this.node.children) {
        const p = ch.position;
        ch.setPosition(new Vec3(p.x + dx, p.y, p.z));
      }
    }
    ui.setContentSize(targetW, h);
    this.ensureSwayBases();
  }

  private ensureSwayBases() {
    if (this._swayBases.length > 0) return;
    this.refreshSwayBasesFromScene();
  }

  private refreshSwayBasesFromScene() {
    this._swayBases.length = 0;
    for (const ch of this.node.children) {
      const isTornRoot =
        ch.name === this.leftTornName || ch.name === this.rightTornName;
      if (isTornRoot) {
        this.collectSwaySubtree(ch, 0, this.swayTornSubtreeDepth);
      } else {
        const p = ch.position;
        const e = ch.eulerAngles;
        this._swayBases.push({
          node: ch,
          layoutPos: new Vec3(p.x, p.y, p.z),
          layoutEuler: new Vec3(e.x, e.y, e.z),
          kind: 'whole',
        });
      }
    }
  }

  private collectSwaySubtree(node: Node, depth: number, maxDepth: number) {
    const p = node.position;
    const e = node.eulerAngles;
    this._swayBases.push({
      node,
      layoutPos: new Vec3(p.x, p.y, p.z),
      layoutEuler: new Vec3(e.x, e.y, e.z),
      kind: 'torn',
    });
    if (depth >= maxDepth) return;
    for (const c of node.children) {
      this.collectSwaySubtree(c, depth + 1, maxDepth);
    }
  }

  private resetSwayToLayoutOnly() {
    for (const e of this._swayBases) {
      e.node.setPosition(e.layoutPos.x, e.layoutPos.y, e.layoutPos.z);
      e.node.setRotationFromEuler(e.layoutEuler.x, e.layoutEuler.y, e.layoutEuler.z);
    }
  }

  private updateRibbonSway(dt: number) {
    if (!this.swayEnabled || this.gameStopped || GamePause.paused) return;
    if (this._swayBases.length === 0) return;

    this._swayTime += dt;
    const t = this._swayTime;

    for (const e of this._swayBases) {
      const n = e.node;
      if (!n.activeInHierarchy) continue;

      const torn = e.kind === 'torn';
      const windHzRaw = torn
        ? this.swayTornWindHz > 0
          ? this.swayTornWindHz
          : this.swayWindHz
        : this.swayWindHz;
      const windHz = Math.max(windHzRaw, 0.2);
      const omega = windHz * Math.PI * 2;
      const rotDeg = torn ? this.swayTornRotationDeg : this.swayRotationDeg;
      const vertPx = this.swayVerticalPx;
      const hBase = this.swayRotationHarmonic;

      const lagK = torn ? this.swayTornLagPerLocalX : this.swayLagPerLocalX;
      const lagRad = e.layoutPos.x * lagK;
      const windAngle = t * omega + this._windPhase0 + lagRad;

      let pieceAmp = 1;
      if (torn) {
        pieceAmp =
          e.node.parent === this.node ? this.swayTornRootAmp : this.swayTornPieceAmp;
      }

      let dr: number;
      let dy: number;
      if (torn) {
        dr = rotDeg * pieceAmp * Math.sin(windAngle);
        dy = 0;
      } else {
        const gust = Math.sin(windAngle);
        const ripple = Math.sin(windAngle * 2 + 0.35);
        dr = rotDeg * pieceAmp * (gust + hBase * ripple * 0.45);
        dy = vertPx * gust * pieceAmp;
      }

      n.setPosition(e.layoutPos.x, e.layoutPos.y + dy, e.layoutPos.z);
      n.setRotationFromEuler(e.layoutEuler.x, e.layoutEuler.y, e.layoutEuler.z + dr);
    }
  }

  /** collectibleLayer → bgRoot: масштаб совпадает с RunnerWorldScroller.worldScale */
  private getWorldRootScaleX(): number {
    const bgRoot = this.node.parent?.parent;
    const s = bgRoot?.scale.x ?? 1;
    return Math.abs(s) > 1e-6 ? Math.abs(s) : 1;
  }

  public shouldKeepInWorld(): boolean {
    return this.ropeTorn || this.gameStopped;
  }

  lateUpdate(dt: number) {
    this.updateRibbonSway(dt);
  }

  update(dt: number) {
    if (this.gameStopped || GamePause.paused) return;
    const player = this.playerRef;
    if (!player) return;

    if (this.awaitingRunPast) {
      this.waitPastTimer += dt;
      if (this.isFinishPastPlayer(player) || this.waitPastTimer >= this.maxWaitPastFinishSec) {
        this.completeFinishStopAndPackshot();
      }
      return;
    }

    if (this.testPlayerOverlap(player)) {
      this.tearRopeVisualsNow();
      this.awaitingRunPast = true;
      this.waitPastTimer = 0;
    }
  }

  private testPlayerOverlap(player: Node): boolean {
    const tileUi = this.node.getComponent(UITransform);
    const pUi = player.getComponent(UITransform);
    if (!tileUi || !pUi) return false;

    const pPos = player.worldPosition;
    const pW = pUi.contentSize.width * Math.abs(player.scale.x);
    const pH = pUi.contentSize.height * Math.abs(player.scale.y);
    const pLeft = pPos.x - pW / 2 + this.playerHitboxShrinkX;
    const pRight = pPos.x + pW / 2 - this.playerHitboxShrinkX;
    const pBottom = pPos.y - pH / 2 + this.playerHitboxShrinkY;
    const pTop = pPos.y + pH / 2 - this.playerHitboxShrinkY;

    const oPos = this.node.worldPosition;
    const oW = tileUi.contentSize.width * Math.abs(this.node.scale.x);
    const oH = tileUi.contentSize.height * Math.abs(this.node.scale.y);
    const oLeft = oPos.x - oW / 2;
    const oRight = oPos.x + oW / 2;
    const oBottom = oPos.y - oH / 2;
    const oTop = oPos.y + oH / 2;

    return pLeft < oRight && pRight > oLeft && pBottom < oTop && pTop > oBottom;
  }

  private isFinishPastPlayer(player: Node): boolean {
    const tileUi = this.node.getComponent(UITransform);
    const pUi = player.getComponent(UITransform);
    if (!tileUi || !pUi) return false;

    const oPos = this.node.worldPosition;
    const oW = tileUi.contentSize.width * Math.abs(this.node.scale.x);
    const oRight = oPos.x + oW / 2;

    const pPos = player.worldPosition;
    const pW = pUi.contentSize.width * Math.abs(player.scale.x);
    const pLeft = pPos.x - pW / 2 + this.playerHitboxShrinkX;

    return oRight < pLeft - this.runPastFinishMarginPx;
  }

  private tearRopeVisualsNow() {
    if (this.ropeTorn) return;
    this.ropeTorn = true;

    if (this._swayBases.length > 0) {
      this.resetSwayToLayoutOnly();
    }

    const root = this.node;
    const leftWhole = root.getChildByName(this.leftThreadGroupName);
    const rightWhole = root.getChildByName(this.rightThreadGroupName);
    const tornL = root.getChildByName(this.leftTornName);
    const tornR = root.getChildByName(this.rightTornName);

    if (leftWhole) leftWhole.active = false;
    if (rightWhole) rightWhole.active = false;
    if (tornL) tornL.active = true;
    if (tornR) tornR.active = true;

    this.refreshSwayBasesFromScene();
    this.scheduleOnce(() => this.refreshSwayBasesFromScene(), 0);
  }

  private completeFinishStopAndPackshot() {
    if (this.gameStopped) return;
    this.gameStopped = true;
    this.awaitingRunPast = false;

    GamePause.setPaused(true);
    const canvas = WinPresenter.getCanvasFromNode(this.node);
    canvas?.getComponent(WinPresenter)?.showWinPackshot();
  }
}
