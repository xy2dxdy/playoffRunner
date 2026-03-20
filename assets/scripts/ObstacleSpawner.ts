import { _decorator, Component, Node, Prefab, instantiate, UITransform, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ObstacleSpawner')
export class ObstacleSpawner extends Component {
  @property({ type: Prefab, tooltip: 'Префаб препятствия' })
  obstaclePrefab: Prefab | null = null;

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

  private lives = 3;
  private invincibilityTimer = 0;
  private timeSinceStart = 0;
  private nextSpawnTime = 0;
  private obstacles: Node[] = [];
  private canvasWidth = 0;

  start() {
    this.lives = this.maxLives;
    this.invincibilityTimer = 0;
    this.timeSinceStart = 0;
    this.nextSpawnTime = this.firstObstacleDelaySec;

    const canvasUi = this.node.getComponent(UITransform);
    if (canvasUi) {
      this.canvasWidth = canvasUi.contentSize.width;
    }
  }

  private gameOver = false;

  update(dt: number) {
    this.moveAndCleanObstacles(dt);

    if (this.gameOver) return;

    this.timeSinceStart += dt;

    if (this.invincibilityTimer > 0) {
      this.invincibilityTimer -= dt;
      if (this.playerNode) {
        const visible = Math.floor(this.invincibilityTimer * 10) % 2 === 0;
        this.playerNode.active = visible;
      }
      if (this.invincibilityTimer <= 0) {
        this.invincibilityTimer = 0;
        if (this.playerNode) this.playerNode.active = true;
      }
    }

    if (this.timeSinceStart >= this.nextSpawnTime) {
      this.spawnObstacle();
      this.nextSpawnTime = this.timeSinceStart + this.randomRange(this.intervalMinSec, this.intervalMaxSec);
    }

    this.checkCollisions();
  }

  private spawnObstacle() {
    if (!this.obstaclePrefab) return;

    const node = instantiate(this.obstaclePrefab);
    node.parent = this.node;

    const spawnX = this.canvasWidth / 2 + 100;
    node.setPosition(new Vec3(spawnX, this.obstacleY, 0));
    this.obstacles.push(node);
  }

  private moveAndCleanObstacles(dt: number) {
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

    for (const obs of this.obstacles) {
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
    console.log(`[ObstacleSpawner] Игрок получил урон! Жизней: ${this.lives}/${this.maxLives}`);

    if (this.lives <= 0) {
      this.onGameOver();
    }
  }

  private onGameOver() {
    this.gameOver = true;
    if (this.playerNode) this.playerNode.active = true;
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
