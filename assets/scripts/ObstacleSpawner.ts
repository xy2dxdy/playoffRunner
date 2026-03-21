import { _decorator, Component, Node, Prefab, instantiate, UITransform, UIOpacity, Vec3, view } from 'cc';
import { EnemyController } from './EnemyController';
import { PlayerJump } from './PlayerJump';
import { GamePause } from './GamePause';
import { JumpTutorialController } from './JumpTutorialController';
import { GameOverPresenter } from './GameOverPresenter';
import { WinPresenter } from './WinPresenter';
import { EndTilesSpawner } from './EndTilesSpawner';
const { ccclass, property } = _decorator;

@ccclass('ObstacleSpawner')
export class ObstacleSpawner extends Component {
  @property({ type: Prefab, tooltip: 'Префаб препятствия' })
  obstaclePrefab: Prefab | null = null;

  @property({
    type: [Number],
    tooltip: 'Если заполнен: спавнить препятствия в эти секунды от старта игры. Если пустой — используется intervalMin/Max.',
  })
  obstacleSpawnTimesSec: number[] = [];

  @property({ type: Node, tooltip: 'Узел игрока (для проверки столкновений)' })
  playerNode: Node | null = null;

  @property({ tooltip: 'Скорость движения препятствий влево (px/s). Должна совпадать со scrollSpeed в RunnerWorldScroller.' })
  scrollSpeed = 300;

  @property({ tooltip: 'Через сколько секунд после старта появится первое препятствие' })
  firstObstacleDelaySec = 2;

  @property({ tooltip: 'Минимальный интервал между препятствиями (секунды)' })
  intervalMinSec = 1.5;

  @property({ tooltip: 'Максимальный интервал между препятствиями (секунды)' })
  intervalMaxSec = 3.5;

  @property({ tooltip: 'Y позиция препятствия (px, в координатах Canvas)' })
  obstacleY = -175;

  @property({ type: Prefab, tooltip: 'Префаб врага (enemy), двигается влево и тоже бьет игрока' })
  enemyPrefab: Prefab | null = null;

  @property({
    type: [Number],
    tooltip: 'Если заполнен: спавнить enemies в эти секунды от старта игры. Если пустой — используется intervalMin/Max.',
  })
  enemySpawnTimesSec: number[] = [];

  @property({ tooltip: 'Y позиция enemy (px, в координатах Canvas)' })
  enemyY = -175;

  @property({ tooltip: 'Скорость врага влево (px/s). Должна быть больше scrollSpeed платформы.' })
  enemySpeed = 650;

  @property({ tooltip: 'Марджин за левым краем для врага (px).' })
  enemyOffscreenMargin = 200;

  @property({
    tooltip: 'Отступ спавна препятствий/врагов за правым краем (px). Одинаков в портрете и альбоме.',
  })
  hazardSpawnMarginPx = 140;

  @property({ tooltip: 'Сколько жизней у игрока' })
  maxLives = 3;

  @property({ tooltip: 'Длительность неуязвимости после урона (секунды)' })
  invincibilityDurationSec = 1.5;

  @property({ tooltip: 'Сужение хитбокса игрока по X с каждой стороны (px)' })
  playerHitboxShrinkX = 15;

  @property({ tooltip: 'Сужение хитбокса игрока по Y с каждой стороны (px)' })
  playerHitboxShrinkY = 15;

  @property({ tooltip: 'Сужение хитбокса препятствия по X с каждой стороны (px)' })
  obstacleHitboxShrinkX = 5;

  @property({ tooltip: 'Сужение хитбокса препятствия по Y с каждой стороны (px)' })
  obstacleHitboxShrinkY = 5;

  @property({ type: [Node], tooltip: 'Узлы сердец (hearts) на сцене. Порядок: [heart1, heart2, heart3]' })
  heartNodes: Node[] = [];

  @property({ tooltip: 'Прозрачность потерянного сердца (0–255)' })
  lostHeartOpacity = 80;

  private lives = 3;
  private invincibilityTimer = 0;
  private timeSinceStart = 0;
  private nextSpawnTime = 0;
  private nextEnemySpawnTime = 0;
  private obstacles: Node[] = [];
  private enemies: Node[] = [];
  private canvasWidth = 0;

  private obstacleSpawnIndex = 0;
  private enemySpawnIndex = 0;

  onLoad() {
    JumpTutorialController.attach(this.node);
    GameOverPresenter.attach(this.node);
    WinPresenter.attach(this.node);
    EndTilesSpawner.attach(this.node);
    view.on('canvas-resize', this._onCanvasResize, this);
  }

  onDestroy() {
    view.off('canvas-resize', this._onCanvasResize, this);
  }

  private _onCanvasResize() {
    this.refreshCanvasWidth();
  }

  start() {
    this.lives = this.maxLives;
    this.invincibilityTimer = 0;
    this.timeSinceStart = 0;
    this.nextSpawnTime = this.firstObstacleDelaySec;
    this.nextEnemySpawnTime = this.firstObstacleDelaySec;
    this.obstacleSpawnIndex = 0;
    this.enemySpawnIndex = 0;

    this.refreshCanvasWidth();
  }

  private refreshCanvasWidth() {
    const vs = view.getVisibleSize();
    if (vs.width > 0) {
      this.canvasWidth = vs.width;
      return;
    }
    const canvasUi = this.node.getComponent(UITransform);
    if (canvasUi && canvasUi.contentSize.width > 0) {
      this.canvasWidth = canvasUi.contentSize.width;
    } else if (this.canvasWidth <= 0) {
      const dr = view.getDesignResolutionSize();
      this.canvasWidth = dr.width;
    }
  }

  /** Правый край + фиксированный отступ в px — время выхода в зону видимости не зависит от ориентации. */
  private getHazardSpawnX(): number {
    const half = this.canvasWidth * 0.5;
    const x = half + this.hazardSpawnMarginPx;
    if (!Number.isFinite(x)) {
      return half + 120;
    }
    return x;
  }

  private gameOver = false;

  update(dt: number) {
    if (GamePause.paused) return;
    if (this.gameOver) return;

    this.refreshCanvasWidth();
    this.moveAndCleanHazards(dt);

    this.timeSinceStart += dt;

    const tutorial = this.node.getComponent(JumpTutorialController);
    if (tutorial && !tutorial.isTutorialCompleted()) {
      if (this.timeSinceStart >= tutorial.getEffectiveTutorialDelaySec()) {
        tutorial.requestBeginFromGameClock();
      }
    }

    if (GamePause.paused) return;

    if (this.invincibilityTimer > 0) {
      this.invincibilityTimer -= dt;
      if (this.invincibilityTimer <= 0) {
        this.invincibilityTimer = 0;
      }
    }

    this.handleSpawns();
    this.checkCollisions();
  }

  private spawnObstacle() {
    if (!this.obstaclePrefab) return;

    const node = instantiate(this.obstaclePrefab);
    node.parent = this.node;
    this.placeHazardBehindPlayer(node);

    const spawnX = this.getHazardSpawnX();
    node.setPosition(new Vec3(spawnX, this.obstacleY, 0));
    this.obstacles.push(node);
  }

  private spawnEnemy() {
    if (!this.enemyPrefab) return;

    const node = instantiate(this.enemyPrefab);
    node.parent = this.node;
    this.placeHazardBehindPlayer(node);

    const spawnX = this.getHazardSpawnX();
    node.setPosition(new Vec3(spawnX, this.enemyY, 0));
    const controller = node.getComponent(EnemyController) ?? node.addComponent(EnemyController);
    if (controller) {
      controller.speed = this.enemySpeed;
      controller.offscreenMargin = this.enemyOffscreenMargin;
    }
    this.enemies.push(node);
  }

  private placeHazardBehindPlayer(hazard: Node) {
    if (!this.playerNode) return;
    const idx = this.playerNode.getSiblingIndex();
    hazard.setSiblingIndex(idx);
  }

  private moveAndCleanHazards(dt: number) {
    const removeList: Node[] = [];
    const leftLimit = -this.canvasWidth / 2 - 200;

    for (const obs of this.obstacles) {
      const pos = obs.position;
      const newX = pos.x - this.scrollSpeed * dt;
      obs.setPosition(new Vec3(newX, pos.y, pos.z));

      if (newX < leftLimit) {
        removeList.push(obs);
      }
    }

    for (const obs of removeList) {
      const idx = this.obstacles.indexOf(obs);
      if (idx >= 0) this.obstacles.splice(idx, 1);
      obs.destroy();
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e) {
        this.enemies.splice(i, 1);
        continue;
      }
      const isValid = (e as any).isValid;
      if (isValid === false) {
        this.enemies.splice(i, 1);
        continue;
      }
      if (e.position.x < leftLimit) {
        e.destroy();
        this.enemies.splice(i, 1);
      }
    }
  }

  private handleSpawns() {
    if (this.obstacleSpawnTimesSec && this.obstacleSpawnTimesSec.length > 0) {
      while (
        this.obstacleSpawnIndex < this.obstacleSpawnTimesSec.length &&
        this.timeSinceStart >= this.obstacleSpawnTimesSec[this.obstacleSpawnIndex]
      ) {
        this.spawnObstacle();
        this.obstacleSpawnIndex++;
      }
    } else {
      if (this.timeSinceStart >= this.nextSpawnTime) {
        this.spawnObstacle();
        this.nextSpawnTime =
          this.timeSinceStart + this.randomRange(this.intervalMinSec, this.intervalMaxSec);
      }
    }

    if (this.enemySpawnTimesSec && this.enemySpawnTimesSec.length > 0) {
      while (
        this.enemySpawnIndex < this.enemySpawnTimesSec.length &&
        this.timeSinceStart >= this.enemySpawnTimesSec[this.enemySpawnIndex]
      ) {
        this.spawnEnemy();
        this.enemySpawnIndex++;
      }
    } else {
      if (this.enemyPrefab && this.timeSinceStart >= this.nextEnemySpawnTime) {
        this.spawnEnemy();
        this.nextEnemySpawnTime =
          this.timeSinceStart + this.randomRange(this.intervalMinSec, this.intervalMaxSec);
      }
    }
  }

  private checkCollisions() {
    if (!this.playerNode || this.invincibilityTimer > 0 || this.lives <= 0) return;

    const playerUi = this.playerNode.getComponent(UITransform);
    if (!playerUi) return;

    const pPos = this.playerNode.worldPosition;
    const pW = playerUi.contentSize.width * Math.abs(this.playerNode.scale.x);
    const pH = playerUi.contentSize.height * Math.abs(this.playerNode.scale.y);
    const pLeft = pPos.x - pW / 2 + this.playerHitboxShrinkX;
    const pRight = pPos.x + pW / 2 - this.playerHitboxShrinkX;
    const pBottom = pPos.y - pH / 2 + this.playerHitboxShrinkY;
    const pTop = pPos.y + pH / 2 - this.playerHitboxShrinkY;

    const hazards: Node[] = [];
    for (const o of this.obstacles) {
      const valid = o && (o as any).isValid !== false;
      if (valid) hazards.push(o);
    }
    for (const e of this.enemies) {
      const valid = e && (e as any).isValid !== false;
      if (valid) hazards.push(e);
    }

    for (const obs of hazards) {
      const obsUi = obs.getComponent(UITransform);
      if (!obsUi) continue;

      const oPos = obs.worldPosition;
      const oW = obsUi.contentSize.width * Math.abs(obs.scale.x);
      const oH = obsUi.contentSize.height * Math.abs(obs.scale.y);
      const oLeft = oPos.x - oW / 2 + this.obstacleHitboxShrinkX;
      const oRight = oPos.x + oW / 2 - this.obstacleHitboxShrinkX;
      const oBottom = oPos.y - oH / 2 + this.obstacleHitboxShrinkY;
      const oTop = oPos.y + oH / 2 - this.obstacleHitboxShrinkY;

      if (pLeft < oRight && pRight > oLeft && pBottom < oTop && pTop > oBottom) {
        this.onPlayerHit();
        break;
      }
    }
  }

  private onPlayerHit() {
    this.lives--;
    this.invincibilityTimer = this.invincibilityDurationSec;
    this.updateHearts();
    if (this.playerNode) {
      const pj = this.playerNode.getComponent(PlayerJump);
      pj?.triggerDamage();
    }

    if (this.lives <= 0) {
      this.onGameOver();
    }
  }

  private updateHearts() {
    for (let i = 0; i < this.heartNodes.length; i++) {
      const heart = this.heartNodes[i];
      if (!heart) continue;
      const opacity = heart.getComponent(UIOpacity);
      if (!opacity) continue;

      const heartIndex = this.heartNodes.length - 1 - i;
      opacity.opacity = heartIndex >= this.lives ? this.lostHeartOpacity : 255;
    }
  }

  private onGameOver() {
    this.gameOver = true;
    GamePause.setPaused(true);
    if (this.playerNode) {
      this.playerNode.active = true;
      this.playerNode.getComponent(PlayerJump)?.setJumpInputEnabled(false);
    }
    this.node.getComponent(GameOverPresenter)?.showGameOverSequence();
  }

  public getLives(): number {
    return this.lives;
  }

  public getMaxLives(): number {
    return this.maxLives;
  }

  private randomRange(min: number, max: number) {
    const a = Math.min(min, max);
    const b = Math.max(min, max);
    return a + Math.random() * (b - a);
  }
}
