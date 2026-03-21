import { _decorator, Component, Node, Prefab, instantiate, Vec3, assetManager } from 'cc';
import { RunnerWorldScroller } from './RunnerWorldScroller';
import { GamePause } from './GamePause';
import { EndTilesRope } from './EndTilesRope';
import { CollectibleSpawner } from './CollectibleSpawner';

const { ccclass, property } = _decorator;

type ActiveTile = {
  worldX: number;
};

@ccclass('EndTilesSpawner')
export class EndTilesSpawner extends Component {
  @property({ type: RunnerWorldScroller, tooltip: 'Тот же скроллер, что у фона/монет' })
  worldScroller: RunnerWorldScroller | null = null;

  @property({ type: Prefab, tooltip: 'Если пусто — подгрузится по UUID ниже (endTiles.prefab)' })
  endTilesPrefab: Prefab | null = null;

  @property({ tooltip: 'UUID assets/prefabs/endTiles.prefab — используется, если Prefab не задан' })
  endTilesPrefabUuid = 'e639ae60-5bc6-4dea-80ff-df1951ca7adb';

  @property({
    type: [Number],
    tooltip: 'Секунды от старта уровня (после Tap to start), когда создаётся каждый endTiles',
  })
  spawnTimesSec: number[] = [];

  @property({
    type: [Number],
    tooltip: 'Смещение Y в px экрана от земли (как деревья). Длина 1 — одно значение для всех',
  })
  spawnYOffsetsPx: number[] = [0];

  @property({ type: Node, tooltip: 'Игрок' })
  playerNode: Node | null = null;

  @property({ tooltip: 'Спавн у правого края (px)' })
  spawnRightMarginPx = 80;

  private timeSinceStart = 0;
  private spawnIndex = 0;
  private active = new Map<Node, ActiveTile>();
  private warnedNoLayer = false;

  public static attach(canvas: Node): void {
    if (!canvas.getComponent(EndTilesSpawner)) {
      canvas.addComponent(EndTilesSpawner);
    }
  }

  onLoad() {
    if (!this.endTilesPrefab && this.endTilesPrefabUuid) {
      assetManager.loadAny<Prefab>({ uuid: this.endTilesPrefabUuid }, (err, asset) => {
        if (!err && asset) this.endTilesPrefab = asset;
      });
    }
  }

  start() {
    if (!this.worldScroller) {
      this.worldScroller = this.node.getComponent(RunnerWorldScroller);
    }
    if (!this.playerNode) {
      this.playerNode = this.node.getComponent(CollectibleSpawner)?.playerNode ?? null;
    }
  }

  update(dt: number) {
    if (GamePause.paused) return;

    const scroller = this.worldScroller;
    if (!scroller) return;

    const layer = scroller.getCollectibleLayer();
    if (!layer) {
      if (!this.warnedNoLayer) {
        this.warnedNoLayer = true;
        console.warn('[EndTilesSpawner] Нет collectibleLayer — проверьте RunnerWorldScroller.');
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
      const canvasX = data.worldX - wox;
      node.setPosition(new Vec3(canvasX, node.position.y, node.position.z));

      if (canvasX < leftEdge - margin) {
        const rope = node.getComponent(EndTilesRope);
        if (rope?.shouldKeepInWorld()) continue;
        toRemove.push(node);
      }
    }

    for (const n of toRemove) {
      this.active.delete(n);
      n.destroy();
    }
  }

  private trySpawnScheduled(layer: Node, scroller: RunnerWorldScroller) {
    const times = this.spawnTimesSec;
    if (!times || times.length === 0) return;
    if (!this.endTilesPrefab) return;

    while (this.spawnIndex < times.length && this.timeSinceStart >= times[this.spawnIndex]) {
      const node = instantiate(this.endTilesPrefab);
      node.parent = layer;

      const yOff = this.getYForSpawnIndex(this.spawnIndex);
      const centerY = scroller.getCollectibleCenterY(node, yOff);
      const worldX = scroller.getSpawnWorldXAtRightEdge(this.spawnRightMarginPx);

      const canvasX = worldX - scroller.getWorldOffsetX();
      node.setPosition(new Vec3(canvasX, centerY, node.position.z));

      const rope = node.getComponent(EndTilesRope) ?? node.addComponent(EndTilesRope);
      rope.init(this.playerNode);

      this.active.set(node, { worldX });
      this.spawnIndex++;
    }
  }

  private getYForSpawnIndex(i: number): number {
    const ys = this.spawnYOffsetsPx;
    if (!ys || ys.length === 0) return 0;
    if (i < ys.length) return ys[i];
    return ys[ys.length - 1];
  }
}
