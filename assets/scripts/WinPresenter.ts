import { _decorator, Component, Node, Prefab, instantiate, Vec3, assetManager, find } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('WinPresenter')
export class WinPresenter extends Component {
  @property({ type: Prefab, tooltip: 'Переопределение packshotWin.prefab' })
  packshotWinPrefabOverride: Prefab | null = null;

  @property({ tooltip: 'UUID assets/prefabs/packshotWin.prefab' })
  packshotWinPrefabUuid = '3090269d-7e99-45e1-b652-c20109d36673';

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
    const pack = instantiate(this.packshotPrefab);
    pack.parent = this.node;
    pack.setPosition(new Vec3(0, 0, 0));
    pack.setSiblingIndex(this.node.children.length - 1);
    this.sequenceActive = false;
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
