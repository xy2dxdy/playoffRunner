import { _decorator, Component, Node, UITransform } from 'cc';
import { GamePause } from './GamePause';
import { WinPresenter } from './WinPresenter';

const { ccclass, property } = _decorator;

@ccclass('EndTilesRope')
export class EndTilesRope extends Component {
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

  init(player: Node | null) {
    this.playerRef = player ?? this.playerNode;
  }

  public shouldKeepInWorld(): boolean {
    return this.ropeTorn || this.gameStopped;
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

    const root = this.node;
    const leftWhole = root.getChildByName(this.leftThreadGroupName);
    const rightWhole = root.getChildByName(this.rightThreadGroupName);
    const tornL = root.getChildByName(this.leftTornName);
    const tornR = root.getChildByName(this.rightTornName);

    if (leftWhole) leftWhole.active = false;
    if (rightWhole) rightWhole.active = false;
    if (tornL) tornL.active = true;
    if (tornR) tornR.active = true;
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
