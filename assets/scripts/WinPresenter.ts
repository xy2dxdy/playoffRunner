import { _decorator, Component, Node, Prefab, instantiate, Vec3, assetManager, find } from 'cc';
import { CollectibleSpawner } from './CollectibleSpawner';
import { ConfettiPlayer } from './ConfettiPlayer';
import { GameEndOverlayHider } from './GameEndOverlayHider';
import { WinPackshotRewardReveal } from './WinPackshotRewardReveal';
import { SoundController } from './SoundController';

const { ccclass, property } = _decorator;

@ccclass('WinPresenter')
export class WinPresenter extends Component {
  @property({ type: Prefab, tooltip: 'Переопределение packshotWin.prefab' })
  packshotWinPrefabOverride: Prefab | null = null;

  @property({ tooltip: 'UUID assets/prefabs/packshotWin.prefab' })
  packshotWinPrefabUuid = '3090269d-7e99-45e1-b652-c20109d36673';

  @property({ type: Prefab, tooltip: 'Переопределение confettiShot.prefab' })
  confettiShotPrefabOverride: Prefab | null = null;

  @property({ tooltip: 'UUID assets/prefabs/confettiShot.prefab' })
  confettiShotPrefabUuid = 'd1e7f7bf-9101-4e77-8cdb-4d51658c67f4';

  private packshotPrefab: Prefab | null = null;
  private sequenceActive = false;

  public static attach(canvas: Node): void {
    if (!canvas.getComponent(WinPresenter)) {
      canvas.addComponent(WinPresenter);
    }
  }

  public showWinPackshot(): void {
    if (this.sequenceActive) return;
    this.sequenceActive = true;

    this.packshotPrefab = this.packshotWinPrefabOverride;

    if (this.packshotPrefab) {
      this.instantiatePackshot();
      return;
    }

    if (!this.packshotWinPrefabUuid) {
      this.sequenceActive = false;
      return;
    }

    assetManager.loadAny<Prefab>({ uuid: this.packshotWinPrefabUuid }, (err, asset) => {
      if (!err && asset) this.packshotPrefab = asset;
      this.instantiatePackshot();
    });
  }

  private instantiatePackshot(): void {
    if (!this.packshotPrefab) {
      this.sequenceActive = false;
      return;
    }
    GameEndOverlayHider.hideOnCanvas(this.node);
    SoundController.instance?.enterPackshotMode();
    SoundController.instance?.playPackshot();
    const pack = instantiate(this.packshotPrefab);
    pack.parent = this.node;
    pack.setPosition(new Vec3(0, 0, 0));
    pack.setSiblingIndex(this.node.children.length - 1);
    const stats = this.readCollectibleStatsFromCanvas();
    pack.getComponent(WinPackshotRewardReveal)?.setRuntimeTotals(stats.dollars, stats.coins);
    this.sequenceActive = false;
    this.spawnConfettiShot();
  }

  /** CollectibleSpawner на Canvas, не на префабе пакшота — читаем здесь и передаём в WinPackshotRewardReveal */
  private readCollectibleStatsFromCanvas(): { dollars: number; coins: number } {
    const canvas = this.node;
    const sp =
      canvas.getComponent(CollectibleSpawner) ?? canvas.getComponentInChildren(CollectibleSpawner);
    return {
      dollars: sp?.getDollarTotal() ?? 0,
      coins: sp?.getCollectedCount() ?? 0,
    };
  }

  private spawnConfettiShot(): void {
    if (this.confettiShotPrefabOverride) {
      this.instantiateConfettiAndPlay(this.confettiShotPrefabOverride);
      return;
    }
    if (!this.confettiShotPrefabUuid) return;
    assetManager.loadAny<Prefab>({ uuid: this.confettiShotPrefabUuid }, (err, asset) => {
      if (!err && asset) this.instantiateConfettiAndPlay(asset);
    });
  }

  private instantiateConfettiAndPlay(prefab: Prefab): void {
    const node = instantiate(prefab);
    node.parent = this.node;
    node.setPosition(new Vec3(0, 0, 0));
    const s = node.scale;
    node.setScale(new Vec3(s.x * 2, s.y * 2, s.z));
    node.setSiblingIndex(this.node.children.length - 1);
    const player = node.getComponent(ConfettiPlayer);
    if (player) player.play();
  }

  public static getCanvasFromNode(n: Node | null): Node | null {
    if (!n) return null;
    let cur: Node | null = n;
    while (cur) {
      if (cur.name === 'Canvas') return cur;
      cur = cur.parent;
    }
    return find('Canvas');
  }
}
