import { _decorator, Component, Node, Quat, Sprite, UITransform, Vec3, view } from 'cc';
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
  /** torn, корень: локальная точка верха группы (AABB) — вокруг неё вращение; без этого — вокруг якоря узла */
  tornPivotLocal?: Vec3;
  /** torn, корень: фиксированная позиция верха крепления в пространстве endTiles (родитель) */
  tornAttachParent?: Vec3;
};

@ccclass('EndTilesRope')
export class EndTilesRope extends Component {
  @property({
    tooltip:
      'Растянуть ленту по видимой ширине экрана (9-slice на спрайте корня + сдвиг ниток к левому краю)',
  })
  stretchRibbonToViewport = true;

  @property({
    tooltip:
      'Если true — растягивание по ширине только в портрете; в альбоме ширина остаётся как в префабе (без «растянутой» клетки).',
  })
  stretchRibbonOnlyInPortrait = true;

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
    tooltip:
      'После разрыва: амплитуда качания по Z (градусы); верх нити закреплён у «потолка», маятник вокруг этой точки.',
  })
  swayTornRotationDeg = 1.8;

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
      'Глубина поддерева threadTorn*: 0 — покачивать только корень группы (дети наследуют поворот, без «двойного» ветра и отставания от колонн). >0 — каждый узел качается отдельно (может выглядеть оторванным).',
  })
  swayTornSubtreeDepth = 0;

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

  @property({
    tooltip:
      'Имя дочернего узла (полоса/колонка слева): фаза ветра левой порванной нитки совпадает с ним (у threadTorn* часто x=0, а у колонок — другой X).',
  })
  leftColumnWindLagName = '01';

  @property({
    tooltip: 'Имя узла колонки справа — та же логика фазы для правой порванной нитки.',
  })
  rightColumnWindLagName = '02';

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
      this.fillTornTopAttachmentData();
      return;
    }

    if (!this.stretchRibbonToViewport) {
      this.ensureSwayBases();
      this.fillTornTopAttachmentData();
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
    const landscape = vs.width > vs.height;
    let targetW: number;
    if (this.stretchRibbonOnlyInPortrait && landscape) {
      targetW = minW;
    } else {
      targetW = Math.max(
        minW,
        localVisibleW * this.ribbonViewportWidthFraction - inset,
      );
    }

    const curW = ui.contentSize.width;
    const h = ui.contentSize.height;

    if (Math.abs(targetW - curW) < 0.5) {
      this.ensureSwayBases();
      this.fillTornTopAttachmentData();
      return;
    }

    const dx = -(targetW - curW) / 2;

    if (this._swayBases.length > 0) {
      for (const e of this._swayBases) {
        if (e.node.parent === this.node) {
          e.layoutPos.x += dx;
          if (e.tornAttachParent) {
            e.tornAttachParent.x += dx;
          }
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
    this.fillTornTopAttachmentData();
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
    this.fillTornTopAttachmentData();
  }

  /** Верх центра AABB всех спрайтов группы в локали корня threadTorn* (точка крепления к «потолку»). */
  private computeTornPivotLocalTop(tornRoot: Node): Vec3 | null {
    const trUi = tornRoot.getComponent(UITransform);
    if (!trUi) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    const tmp = new Vec3();
    const walk = (nd: Node) => {
      if (!nd.activeInHierarchy) return;
      const ui = nd.getComponent(UITransform);
      if (ui) {
        const rect = ui.getBoundingBoxToWorld();
        const corners = [
          new Vec3(rect.x, rect.y, 0),
          new Vec3(rect.x + rect.width, rect.y, 0),
          new Vec3(rect.x, rect.y + rect.height, 0),
          new Vec3(rect.x + rect.width, rect.y + rect.height, 0),
        ];
        for (const wc of corners) {
          trUi.convertToNodeSpaceAR(wc, tmp);
          if (tmp.x < minX) minX = tmp.x;
          if (tmp.x > maxX) maxX = tmp.x;
          if (tmp.y > maxY) maxY = tmp.y;
          any = true;
        }
      }
      for (const c of nd.children) {
        walk(c);
      }
    };
    walk(tornRoot);
    if (!any || !Number.isFinite(maxY)) return null;
    return new Vec3((minX + maxX) * 0.5, maxY, 0);
  }

  /** После refresh баз: для корней threadTorn* — крепление к верху (не вращение вокруг центра 100×100). */
  private fillTornTopAttachmentData() {
    const parentNode = this.node;
    for (const e of this._swayBases) {
      if (e.kind !== 'torn' || e.node.parent !== parentNode) {
        e.tornPivotLocal = undefined;
        e.tornAttachParent = undefined;
        continue;
      }
      const pl = this.computeTornPivotLocalTop(e.node);
      if (!pl) {
        e.tornPivotLocal = undefined;
        e.tornAttachParent = undefined;
        continue;
      }
      e.tornPivotLocal = pl;
      const q0 = Quat.fromEuler(new Quat(), e.layoutEuler.x, e.layoutEuler.y, e.layoutEuler.z);
      const rpl = new Vec3();
      Vec3.transformQuat(rpl, pl, q0);
      e.tornAttachParent = new Vec3(
        e.layoutPos.x + rpl.x,
        e.layoutPos.y + rpl.y,
        e.layoutPos.z + rpl.z,
      );
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

      // Корни threadTorn* в префабе часто в (0,0), а полосы 01/02 — у краёв; без якоря фаза ветра у ниток и у колонн разъезжается.
      let lagX = e.layoutPos.x;
      let lagK = torn ? this.swayTornLagPerLocalX : this.swayLagPerLocalX;
      if (torn && e.node.parent === this.node) {
        lagK = this.swayLagPerLocalX;
        if (e.node.name === this.leftTornName) {
          lagX = this.getWholeLayoutPosXForWindLag(this.leftColumnWindLagName);
        } else if (e.node.name === this.rightTornName) {
          lagX = this.getWholeLayoutPosXForWindLag(this.rightColumnWindLagName);
        }
      }
      const lagRad = lagX * lagK;
      const windAngle = t * omega + this._windPhase0 + lagRad;

      let pieceAmp = 1;
      if (torn) {
        // При глубине 0 качается только корень threadTorn* — один коэффициент, без разъезда кусков
        pieceAmp =
          this.swayTornSubtreeDepth <= 0 || e.node.parent === this.node
            ? this.swayTornRootAmp
            : this.swayTornPieceAmp;
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

      if (
        torn &&
        e.tornPivotLocal &&
        e.tornAttachParent &&
        e.node.parent === this.node
      ) {
        const q = Quat.fromEuler(
          new Quat(),
          e.layoutEuler.x,
          e.layoutEuler.y,
          e.layoutEuler.z + dr,
        );
        const rpl = new Vec3();
        Vec3.transformQuat(rpl, e.tornPivotLocal, q);
        n.setPosition(
          e.tornAttachParent.x - rpl.x,
          e.tornAttachParent.y - rpl.y,
          e.layoutPos.z,
        );
        n.setRotationFromEuler(e.layoutEuler.x, e.layoutEuler.y, e.layoutEuler.z + dr);
      } else {
        n.setPosition(e.layoutPos.x, e.layoutPos.y + dy, e.layoutPos.z);
        n.setRotationFromEuler(e.layoutEuler.x, e.layoutEuler.y, e.layoutEuler.z + dr);
      }
    }
  }

  /** Локальный X из базы покачивания для полосы-колонки (та же фаза волны, что у края). */
  private getWholeLayoutPosXForWindLag(stripName: string): number {
    const entry = this._swayBases.find((b) => b.node.name === stripName && b.kind === 'whole');
    if (entry) return entry.layoutPos.x;
    const ch = this.node.getChildByName(stripName);
    return ch?.position.x ?? 0;
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
