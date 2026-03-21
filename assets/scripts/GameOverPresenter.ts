import {
  _decorator,
  Component,
  Node,
  Prefab,
  instantiate,
  tween,
  Tween,
  Vec3,
  assetManager,
} from 'cc';
import { CollectibleSpawner } from './CollectibleSpawner';
import { GameEndOverlayHider } from './GameEndOverlayHider';
import { WinPackshotRewardReveal } from './WinPackshotRewardReveal';
import { SoundController } from './SoundController';

const { ccclass, property } = _decorator;

@ccclass('GameOverPresenter')
export class GameOverPresenter extends Component {
  @property({ type: Prefab, tooltip: 'Переопределение fail.prefab' })
  failPrefabOverride: Prefab | null = null;

  @property({ type: Prefab, tooltip: 'Переопределение packshotLose.prefab' })
  packshotLosePrefabOverride: Prefab | null = null;

  @property({ tooltip: 'UUID assets/prefabs/fail.prefab' })
  failPrefabUuid = '85400ce9-2fd0-47c8-843d-266efa227b9f';

  @property({ tooltip: 'UUID assets/prefabs/packshotLose.prefab' })
  packshotLosePrefabUuid = '5fb516be-4237-4db8-8116-50cf496e75ab';

  @property({ tooltip: 'Первый пик скейла fail' })
  failScalePeak = 2.2;

  @property({ tooltip: 'Финальный скейл fail после пульса' })
  failScaleFinal = 2;

  @property({ tooltip: 'Сек: 0 → peak' })
  failUpDurationSec = 0.22;

  @property({ tooltip: 'Сек: peak → final' })
  failDownDurationSec = 0.14;

  @property({ tooltip: 'Пауза после пульса, затем скрыть fail и показать packshot' })
  delayAfterFailPulseSec = 0.35;

  @property({
    tooltip:
      'Имя дочернего узла внутри fail.prefab, к которому применяется скейл (корень префаба не масштабируется)',
  })
  failScaleTargetChildName = 'fail';

  private failPrefab: Prefab | null = null;
  private packshotPrefab: Prefab | null = null;
  private sequenceActive = false;

  public static attach(canvas: Node): void {
    if (!canvas.getComponent(GameOverPresenter)) {
      canvas.addComponent(GameOverPresenter);
    }
  }

  public showGameOverSequence(): void {
    if (this.sequenceActive) return;
    this.sequenceActive = true;
    SoundController.instance?.enterPackshotMode();

    this.failPrefab = this.failPrefabOverride;
    this.packshotPrefab = this.packshotLosePrefabOverride;

    let pending = 0;
    const step = () => {
      pending--;
      if (pending <= 0) this.onPrefabsReady();
    };

    if (!this.failPrefab && this.failPrefabUuid) {
      pending++;
      assetManager.loadAny<Prefab>({ uuid: this.failPrefabUuid }, (err, asset) => {
        if (!err && asset) this.failPrefab = asset;
        step();
      });
    }
    if (!this.packshotPrefab && this.packshotLosePrefabUuid) {
      pending++;
      assetManager.loadAny<Prefab>({ uuid: this.packshotLosePrefabUuid }, (err, asset) => {
        if (!err && asset) this.packshotPrefab = asset;
        step();
      });
    }

    if (pending === 0) {
      this.onPrefabsReady();
    }
  }

  private onPrefabsReady(): void {
    if (!this.failPrefab || !this.packshotPrefab) {
      this.sequenceActive = false;
      return;
    }
    this.runFailAnimation();
  }

  private runFailAnimation(): void {
    GameEndOverlayHider.hideOnCanvas(this.node);
    SoundController.instance?.playFail();
    const failRoot = instantiate(this.failPrefab!);
    failRoot.parent = this.node;
    failRoot.setPosition(new Vec3(0, 0, 0));
    failRoot.setSiblingIndex(this.node.children.length - 1);

    const scaleTarget = this.resolveFailScaleTarget(failRoot);
    scaleTarget.setScale(new Vec3(0, 0, 1));

    const peakXY = new Vec3(this.failScalePeak, this.failScalePeak, 1);
    const final = new Vec3(this.failScaleFinal, this.failScaleFinal, 1);

    tween(scaleTarget)
      .to(this.failUpDurationSec, { scale: peakXY }, { easing: 'backOut' })
      .to(this.failDownDurationSec, { scale: final }, { easing: 'sineOut' })
      .call(() => {
        this.scheduleOnce(() => {
          Tween.stopAllByTarget(scaleTarget);
          if (failRoot && (failRoot as any).isValid !== false) {
            failRoot.destroy();
          }
          this.showPackshotLose();
        }, this.delayAfterFailPulseSec);
      })
      .start();
  }

  private resolveFailScaleTarget(failRoot: Node): Node {
    const name = (this.failScaleTargetChildName ?? '').trim();
    if (!name) return failRoot;
    const child = failRoot.getChildByName(name);
    return child ?? failRoot;
  }

  private showPackshotLose(): void {
    if (!this.packshotPrefab) {
      this.sequenceActive = false;
      return;
    }
    const pack = instantiate(this.packshotPrefab);
    pack.parent = this.node;
    pack.setPosition(new Vec3(0, 0, 0));
    pack.setSiblingIndex(this.node.children.length - 1);
    const stats = this.readCollectibleStatsFromCanvas();
    pack.getComponent(WinPackshotRewardReveal)?.setRuntimeTotals(stats.dollars, stats.coins);
    this.sequenceActive = false;
  }

  private readCollectibleStatsFromCanvas(): { dollars: number; coins: number } {
    const canvas = this.node;
    const sp =
      canvas.getComponent(CollectibleSpawner) ?? canvas.getComponentInChildren(CollectibleSpawner);
    return {
      dollars: sp?.getDollarTotal() ?? 0,
      coins: sp?.getCollectedCount() ?? 0,
    };
  }
}
