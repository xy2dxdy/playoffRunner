import { _decorator, Component, Node, Prefab, instantiate, UITransform, Vec3, Sprite } from 'cc';
import { GamePause } from './GamePause';
const { ccclass, property } = _decorator;

type BgTile = {
  node: Node;
  worldX: number;
  segmentIndex: number;
};

@ccclass('RunnerWorldScroller')
export class RunnerWorldScroller extends Component {
  @property({ type: Prefab, tooltip: 'Префаб фона (bg), который будет скроллиться влево' })
  bgPrefab: Prefab | null = null;

  @property({ type: [Prefab], tooltip: 'Префабы объектов, которые спавнятся рандомно по X' })
  objectPrefabs: Prefab[] = [];

  @property({ tooltip: 'Скорость прокрутки (px/second)' })
  scrollSpeed = 300;

  @property({ tooltip: 'Доп. смещение справа от экрана, откуда начинается спавн (px)' })
  spawnXMarginPx = 50;

  @property({ tooltip: 'Насколько заранее (в секундах) спавнить объекты' })
  prefetchSeconds = 0.6;

  @property({ tooltip: 'Максимум не-кустов за один кадр' })
  maxNonBushSpawnsPerUpdate = 3;

  @property({ tooltip: 'Сколько не-кустов заспавнить при старте' })
  maxNonBushPrefillOnStart = 6;

  @property({ tooltip: 'Когда объект уедет левее экрана на это расстояние — удаляем (px)' })
  despawnMarginPx = 200;

  @property({ tooltip: 'Минимальная дистанция между объектами по X (px)' })
  spacingMinPx = 250;

  @property({ tooltip: 'Максимальная дистанция между объектами по X (px)' })
  spacingMaxPx = 500;

  @property({ tooltip: 'Принудительно задать линию земли по Y' })
  useCustomGroundY = false;

  @property({ tooltip: 'Y координата линии земли (нижняя грань)' })
  groundY = -30;

  @property({ tooltip: 'Сдвиг всех объектов по Y (в px экрана). Отрицательное — ниже.' })
  objectsYOffsetPx = -100;

  @property({ tooltip: 'Вероятность спавна куста рядом с каждым не-кустом' })
  bushOnNonBushChance = 0.5;

  @property({ tooltip: 'Форсить куст через N не-кустов' })
  bushForceEveryNonBushEvents = 3;

  @property({ tooltip: 'Смещение X куста относительно не-куста (min, px)' })
  bushRelativeMinPx = -60;

  @property({ tooltip: 'Смещение X куста относительно не-куста (max, px)' })
  bushRelativeMaxPx = 140;

  private canvasWidth = 0;
  private canvasHeight = 0;
  private worldScale = 1;
  private leftEdge = 0;
  private rightEdge = 0;
  private worldOffsetX = 0;

  private bgTiles: BgTile[] = [];
  private bgTileWidthPx = 0;
  private bgStartWorldX = 0;
  private bgTilesCount = 0;
  private bgAbsScaleX = 1;
  private worldRoot: Node | null = null;
  private treeLayer: Node | null = null;
  private flashlightLayer: Node | null = null;
  private bushLayer: Node | null = null;
  private collectibleLayer: Node | null = null;

  private objectsWorldX = new Map<Node, number>();
  private nextNonBushSpawnWorldX = 0;

  private bushPrefabs: Prefab[] = [];
  private treePrefabs: Prefab[] = [];
  private flashlightPrefabs: Prefab[] = [];

  private lastNonBushCategory: 'tree' | 'flashlight' | null = null;
  private eventsSinceLastBush = 0;

  private toLocalX(screenPx: number) {
    return this.worldScale !== 0 ? screenPx / this.worldScale : screenPx;
  }

  private computeVisualBottomLocalY(node: Node): number | null {
    const sprite = node.getComponent(Sprite);
    const ui = node.getComponent(UITransform);
    const scaleY = node.scale.y;

    if (sprite?.spriteFrame && ui) {
      const frame = sprite.spriteFrame;
      const originalH = frame.originalSize.y;
      const offsetY = frame.offset.y;
      const bottomRelativeY = -originalH / 2 - offsetY;
      return node.position.y + bottomRelativeY * scaleY;
    }

    if (ui) {
      return node.position.y - ui.contentSize.height * scaleY / 2;
    }

    return null;
  }

  private computeCenterYForBottomLocal(bottomLocalY: number, node: Node): number {
    const sprite = node.getComponent(Sprite);
    const ui = node.getComponent(UITransform);
    const scaleY = node.scale.y;

    if (sprite?.spriteFrame && ui) {
      const frame = sprite.spriteFrame;
      const originalH = frame.originalSize.y;
      const offsetY = frame.offset.y;
      return bottomLocalY + (originalH / 2 + offsetY) * scaleY;
    }

    if (ui) {
      return bottomLocalY + ui.contentSize.height * scaleY / 2;
    }

    return bottomLocalY;
  }

  start() {
    if (!this.bgPrefab) return;
    if (this.objectPrefabs.length === 0) return;

    const canvasUi = this.node.getComponent(UITransform);
    if (!canvasUi) return;

    this.canvasWidth = canvasUi.contentSize.width;
    this.canvasHeight = canvasUi.contentSize.height;
    this.leftEdge = -this.canvasWidth / 2;
    this.rightEdge = this.canvasWidth / 2;

    if (!this.useCustomGroundY) {
      const tmp = instantiate(this.objectPrefabs[0]);
      const bottomY = this.computeVisualBottomLocalY(tmp);
      this.groundY = bottomY ?? tmp.position.y;
      tmp.destroy();
    }

    this.bushPrefabs = [];
    this.treePrefabs = [];
    this.flashlightPrefabs = [];
    for (const p of this.objectPrefabs) {
      const name = (p?.name ?? '').toLowerCase();
      if (name.includes('bush')) {
        this.bushPrefabs.push(p);
      } else if (name.includes('tree')) {
        this.treePrefabs.push(p);
      } else if (name.includes('flashlight')) {
        this.flashlightPrefabs.push(p);
      }
    }

    this.initBackground();

    if (!this.useCustomGroundY) {
      this.groundY = this.groundY / this.worldScale;
    }

    this.initObstacles();
  }

  private initBackground() {
    const firstTile = instantiate(this.bgPrefab as Prefab);
    const firstUi = firstTile.getComponent(UITransform);
    const sprite = firstTile.getComponent(Sprite);

    const baseWidth = sprite?.spriteFrame?.originalSize
      ? sprite.spriteFrame.originalSize.x
      : (firstUi ? firstUi.contentSize.width : 0);
    const baseHeight = sprite?.spriteFrame?.originalSize
      ? sprite.spriteFrame.originalSize.y
      : (firstUi ? firstUi.contentSize.height : 0);

    this.bgAbsScaleX = Math.abs(firstTile.scale.x);

    const visualBaseHeight = baseHeight > 0 ? baseHeight * Math.abs(firstTile.scale.y) : 0;
    const worldScale = visualBaseHeight > 0 ? this.canvasHeight / visualBaseHeight : 1;
    this.worldScale = worldScale;

    this.bgTileWidthPx = baseWidth * this.bgAbsScaleX;
    const tileY = firstTile.position.y;
    const baseScaleY = firstTile.scale.y;
    const baseScaleZ = firstTile.scale.z;
    firstTile.destroy();

    if (this.bgTileWidthPx <= 0) return;

    const localCanvasWidth = this.canvasWidth / this.worldScale;
    this.leftEdge = -localCanvasWidth / 2;
    this.rightEdge = localCanvasWidth / 2;

    const tilesNeeded = Math.ceil(localCanvasWidth / this.bgTileWidthPx) + 2;
    this.bgTilesCount = tilesNeeded;
    const firstWorldX = this.leftEdge + this.bgTileWidthPx / 2;
    this.bgStartWorldX = firstWorldX;

    const bgRoot = new Node('bgRoot');
    bgRoot.setPosition(new Vec3(0, 0, 0));
    bgRoot.setScale(this.worldScale, this.worldScale, 1);
    this.node.addChild(bgRoot);
    bgRoot.setSiblingIndex(0);
    this.worldRoot = bgRoot;

    this.bgTiles = [];
    for (let i = 0; i < tilesNeeded; i++) {
      const tileNode = instantiate(this.bgPrefab as Prefab);
      const worldX = firstWorldX + i * this.bgTileWidthPx;
      tileNode.setPosition(new Vec3(worldX, tileY, 0));
      tileNode.parent = bgRoot;
      const mirror = i % 2 === 1;
      tileNode.setScale(mirror ? -this.bgAbsScaleX : this.bgAbsScaleX, baseScaleY, baseScaleZ);
      this.bgTiles.push({ node: tileNode, worldX, segmentIndex: i });
    }

    this.treeLayer = new Node('treeLayer');
    this.treeLayer.setPosition(Vec3.ZERO);
    bgRoot.addChild(this.treeLayer);

    this.flashlightLayer = new Node('flashlightLayer');
    this.flashlightLayer.setPosition(Vec3.ZERO);
    bgRoot.addChild(this.flashlightLayer);

    this.bushLayer = new Node('bushLayer');
    this.bushLayer.setPosition(Vec3.ZERO);
    bgRoot.addChild(this.bushLayer);

    this.collectibleLayer = new Node('collectibleLayer');
    this.collectibleLayer.setPosition(Vec3.ZERO);
    bgRoot.addChild(this.collectibleLayer);
  }

  public getCollectibleLayer(): Node | null {
    return this.collectibleLayer;
  }

  public getWorldOffsetX(): number {
    return this.worldOffsetX;
  }

  public getWorldScale(): number {
    return this.worldScale;
  }

  public getLeftEdge(): number {
    return this.leftEdge;
  }

  public getRightEdge(): number {
    return this.rightEdge;
  }

  public getGroundY(): number {
    return this.groundY;
  }

  public getDespawnMarginLocal(): number {
    return this.toLocalX(this.despawnMarginPx);
  }

  public getCollectibleCenterY(node: Node, yOffsetPx: number): number {
    const yOffset = this.toLocalX(yOffsetPx);
    return this.computeCenterYForBottomLocal(this.groundY + yOffset, node);
  }

  public getSpawnWorldXAtRightEdge(screenMarginPx: number): number {
    return this.worldOffsetX + this.rightEdge + this.toLocalX(screenMarginPx);
  }

  private initObstacles() {
    this.worldOffsetX = 0;
    this.objectsWorldX.clear();

    const spawnAheadPx = this.getSpawnAheadPx();
    const firstSpawnX = this.leftEdge + this.randomRange(0, this.toLocalX(this.spacingMinPx));
    this.nextNonBushSpawnWorldX = firstSpawnX;
    this.lastNonBushCategory = null;
    this.eventsSinceLastBush = 0;

    const spawnTargetWorldX = this.rightEdge + spawnAheadPx;
    let spawned = 0;
    while (
      this.nextNonBushSpawnWorldX <= spawnTargetWorldX &&
      spawned < this.maxNonBushPrefillOnStart
    ) {
      this.spawnNonBushNow(this.nextNonBushSpawnWorldX);
      this.nextNonBushSpawnWorldX += this.randomRange(
        this.toLocalX(this.spacingMinPx),
        this.toLocalX(this.spacingMaxPx)
      );
      spawned++;
    }
  }

  private spawnNonBushNow(worldX: number) {
    const nextCategory = this.pickNextNonBushCategory();
    const prefab = this.pickRandomFromCategory(nextCategory);

    const node = instantiate(prefab);
    const layer = nextCategory === 'flashlight' ? this.flashlightLayer : this.treeLayer;
    node.parent = layer ?? this.worldRoot ?? this.node;

    const yOffset = this.toLocalX(this.objectsYOffsetPx);
    const centerY = this.computeCenterYForBottomLocal(this.groundY + yOffset, node);

    const canvasX = worldX - this.worldOffsetX;
    node.setPosition(new Vec3(canvasX, centerY, node.position.z));
    this.objectsWorldX.set(node, worldX);

    this.maybeSpawnBushNear(worldX);
  }

  private pickNextNonBushCategory(): 'tree' | 'flashlight' {
    const hasTree = this.treePrefabs.length > 0;
    const hasFlash = this.flashlightPrefabs.length > 0;

    if (!hasTree && !hasFlash) {
      throw new Error('[RunnerWorldScroller] Нет ни tree, ни flashlight префабов.');
    }

    if (this.lastNonBushCategory === 'tree' && hasFlash) return 'flashlight';
    if (this.lastNonBushCategory === 'flashlight' && hasTree) return 'tree';

    if (this.lastNonBushCategory === null) {
      if (hasTree && hasFlash) return Math.random() < 0.5 ? 'tree' : 'flashlight';
      return hasTree ? 'tree' : 'flashlight';
    }

    return hasTree ? 'tree' : 'flashlight';
  }

  private pickRandomFromCategory(category: 'tree' | 'flashlight'): Prefab {
    const arr = category === 'tree' ? this.treePrefabs : this.flashlightPrefabs;
    if (arr.length === 0) {
      const fallbackArr = category === 'tree' ? this.flashlightPrefabs : this.treePrefabs;
      return fallbackArr[Math.floor(Math.random() * fallbackArr.length)];
    }

    const idx = Math.floor(Math.random() * arr.length);
    const prefab = arr[idx];
    this.lastNonBushCategory = category;
    return prefab;
  }

  private maybeSpawnBushNear(nonBushWorldX: number) {
    if (this.bushPrefabs.length === 0) {
      this.eventsSinceLastBush++;
      return;
    }

    const force = this.eventsSinceLastBush >= this.bushForceEveryNonBushEvents;
    const roll = Math.random() < this.bushOnNonBushChance;
    const spawnBush = force || roll;

    if (!spawnBush) {
      this.eventsSinceLastBush++;
      return;
    }

    const prefab = this.bushPrefabs[Math.floor(Math.random() * this.bushPrefabs.length)];
    const node = instantiate(prefab);
    node.parent = this.bushLayer ?? this.worldRoot ?? this.node;

    const yOffset = this.toLocalX(this.objectsYOffsetPx);
    const centerY = this.computeCenterYForBottomLocal(this.groundY + yOffset, node);

    const bushRelX = this.randomRange(
      this.toLocalX(this.bushRelativeMinPx),
      this.toLocalX(this.bushRelativeMaxPx)
    );
    const desiredWorldX = nonBushWorldX + bushRelX;

    const minWorldX = this.worldOffsetX + (this.leftEdge - this.toLocalX(this.despawnMarginPx));
    const clampedWorldX = Math.max(desiredWorldX, minWorldX);

    const canvasX = clampedWorldX - this.worldOffsetX;
    node.setPosition(new Vec3(canvasX, centerY, node.position.z));
    this.objectsWorldX.set(node, clampedWorldX);

    this.eventsSinceLastBush = 0;
  }

  update(dt: number) {
    if (!this.bgPrefab || this.bgTiles.length === 0) return;
    if (GamePause.paused) return;

    this.worldOffsetX += (this.scrollSpeed / this.worldScale) * dt;

    for (const tile of this.bgTiles) {
      const canvasX = tile.worldX - this.worldOffsetX;
      tile.node.setPosition(new Vec3(canvasX, tile.node.position.y, tile.node.position.z));
    }

    for (const tile of this.bgTiles) {
      const canvasX = tile.worldX - this.worldOffsetX;
      if (canvasX < this.leftEdge - this.bgTileWidthPx) {
        tile.segmentIndex += this.bgTilesCount;
        tile.worldX = this.bgStartWorldX + tile.segmentIndex * this.bgTileWidthPx;

        const mirror = tile.segmentIndex % 2 === 1;
        const s = tile.node.scale;
        tile.node.setScale(mirror ? -this.bgAbsScaleX : this.bgAbsScaleX, s.y, s.z);
        tile.node.setPosition(new Vec3(tile.worldX - this.worldOffsetX, tile.node.position.y, tile.node.position.z));
      }
    }

    const spawnAheadPx = this.getSpawnAheadPx();
    const spawnLimitX = this.rightEdge + spawnAheadPx;
    let spawned = 0;
    while (
      this.nextNonBushSpawnWorldX - this.worldOffsetX <= spawnLimitX &&
      spawned < this.maxNonBushSpawnsPerUpdate
    ) {
      this.spawnNonBushNow(this.nextNonBushSpawnWorldX);
      this.nextNonBushSpawnWorldX += this.randomRange(
        this.toLocalX(this.spacingMinPx),
        this.toLocalX(this.spacingMaxPx)
      );
      spawned++;
    }

    const nodesToRemove: Node[] = [];
    for (const [node, worldX] of this.objectsWorldX.entries()) {
      const canvasX = worldX - this.worldOffsetX;
      node.setPosition(new Vec3(canvasX, node.position.y, node.position.z));

      if (canvasX < this.leftEdge - this.toLocalX(this.despawnMarginPx)) {
        nodesToRemove.push(node);
      }
    }

    for (const node of nodesToRemove) {
      this.objectsWorldX.delete(node);
      node.destroy();
    }
  }

  private randomRange(min: number, max: number) {
    const a = Math.min(min, max);
    const b = Math.max(min, max);
    return a + Math.random() * (b - a);
  }

  private getSpawnAheadPx() {
    const aheadScreenPx = Math.max(this.spawnXMarginPx, this.scrollSpeed * this.prefetchSeconds);
    return this.toLocalX(aheadScreenPx);
  }
}
