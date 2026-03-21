import { _decorator, Component, Node, Label, Vec3, tween, Tween, director } from 'cc';
import { CollectibleSpawner } from './CollectibleSpawner';

const { ccclass, property } = _decorator;

function isDescendantOf(node: Node | null, ancestor: Node | null): boolean {
  if (!node || !ancestor) return false;
  let p: Node | null = node;
  while (p) {
    if (p === ancestor) return true;
    p = p.parent;
  }
  return false;
}

/**
 * Вешается на корень packshotWin: после задержки включает узлы,
 * анимирует scale 0 → peak → final и плавно показывает сумму / число монет.
 * Суммы передаёт WinPresenter.setRuntimeTotals при спавне (CollectibleSpawner не на префабе).
 */
@ccclass('WinPackshotRewardReveal')
export class WinPackshotRewardReveal extends Component {
  @property({
    tooltip:
      'Секунды после появления пакшота (салют — только у победы). 0 = без ожидания, сразу показ (packshot проигрыша)',
  })
  delayAfterConfettiSec = 3.2;

  @property({
    type: [Node],
    tooltip: 'Скрыть до показа (active=false), затем active=true вместе со скейлом',
  })
  activateNodes: Node[] = [];

  @property({ type: Node, tooltip: 'Узел: скейл 0 → peak → final (скрыт до показа)' })
  scaleNode: Node | null = null;

  @property({ type: Label, tooltip: 'Текст суммы или числа монет' })
  dollarLabel: Label | null = null;

  @property({
    tooltip:
      'Включить — число подобранных монет (getCollectedCount). Выключить — доллары (getDollarTotal), формат $0.00',
  })
  showCollectedCoinCount = false;

  @property({ tooltip: 'Пик скейла (после старта с 0)' })
  scalePeak = 0.7;

  @property({ tooltip: 'Финальный скейл после пика' })
  scaleFinal = 0.6;

  @property({ tooltip: 'Длительность 0 → peak (сек)' })
  scaleUpSec = 0.38;

  @property({ tooltip: 'Длительность peak → final (сек)' })
  scaleDownSec = 0.22;

  @property({ tooltip: 'Длительность набора числа на лейбле (сек)' })
  countUpSec = 1.35;

  private _countElapsed = 0;
  private _countTarget = 0;
  private _countingUp = false;

  /** Вызывается из WinPresenter сразу после instantiate — не нужно тянуть CollectibleSpawner в префаб */
  private _runtimeDollars = 0;
  private _runtimeCoins = 0;
  private _hasRuntimeTotals = false;

  public setRuntimeTotals(totalDollars: number, collectedCoins: number): void {
    this._runtimeDollars = totalDollars;
    this._runtimeCoins = collectedCoins;
    this._hasRuntimeTotals = true;
  }

  onLoad() {
    for (const n of this.activateNodes) {
      if (n?.isValid) n.active = false;
    }
    if (this.scaleNode?.isValid) {
      this.scaleNode.active = false;
    }
    if (this.dollarLabel?.node?.isValid) {
      const ln = this.dollarLabel.node;
      const hiddenByScale = this.scaleNode && isDescendantOf(ln, this.scaleNode);
      const hiddenByActivate = this.activateNodes.some((a) => a && isDescendantOf(ln, a));
      if (!hiddenByScale && !hiddenByActivate) {
        ln.active = false;
      }
    }
  }

  start() {
    if (this.scaleNode?.isValid) {
      const z = this.scaleNode.scale.z;
      this.scaleNode.setScale(new Vec3(0, 0, z));
    }
    this.refreshLabelInitial();
    if (this.delayAfterConfettiSec <= 0) {
      this.runReveal();
    } else {
      this.scheduleOnce(this.runReveal, this.delayAfterConfettiSec);
    }
  }

  private refreshLabelInitial() {
    if (!this.dollarLabel) return;
    if (this.showCollectedCoinCount) {
      this.dollarLabel.string = '0';
    } else {
      this.dollarLabel.string = '$0.00';
    }
  }

  onDestroy() {
    this.unschedule(this.runReveal);
    this._countingUp = false;
    if (this.scaleNode?.isValid) Tween.stopAllByTarget(this.scaleNode);
  }

  update(dt: number) {
    if (!this._countingUp || !this.dollarLabel?.isValid) return;
    this._countElapsed += dt;
    const r = Math.min(1, this._countElapsed / Math.max(0.001, this.countUpSec));
    const t = 1 - (1 - r) * (1 - r);
    const v = this._countTarget * t;
    if (this.showCollectedCoinCount) {
      this.dollarLabel.string = `${Math.round(v)}`;
    } else {
      this.dollarLabel.string = `$${v.toFixed(2)}`;
    }
    if (r >= 1) {
      if (this.showCollectedCoinCount) {
        this.dollarLabel.string = `${Math.round(this._countTarget)}`;
      } else {
        this.dollarLabel.string = `$${this._countTarget.toFixed(2)}`;
      }
      this._countingUp = false;
    }
  }

  private runReveal = () => {
    for (const n of this.activateNodes) {
      if (n?.isValid) n.active = true;
    }
    if (this.scaleNode?.isValid) {
      this.scaleNode.active = true;
    }
    if (this.dollarLabel?.node?.isValid) {
      const ln = this.dollarLabel.node;
      if (!isDescendantOf(ln, this.scaleNode)) {
        ln.active = true;
      }
    }

    if (this._hasRuntimeTotals) {
      this._countTarget = this.showCollectedCoinCount ? this._runtimeCoins : this._runtimeDollars;
    } else {
      this._countTarget = this.fallbackTotalsFromScene();
    }

    this._countElapsed = 0;
    this._countingUp = false;

    if (this.scaleNode?.isValid) {
      const z = this.scaleNode.scale.z;
      Tween.stopAllByTarget(this.scaleNode);
      this.scaleNode.setScale(new Vec3(0, 0, z));
      const peak = new Vec3(this.scalePeak, this.scalePeak, z);
      const fin = new Vec3(this.scaleFinal, this.scaleFinal, z);
      tween(this.scaleNode)
        .to(this.scaleUpSec, { scale: peak }, { easing: 'backOut' })
        .to(this.scaleDownSec, { scale: fin }, { easing: 'sineOut' })
        .start();
    }

    if (this.dollarLabel) {
      this.refreshLabelInitial();
      if (this.countUpSec <= 0) {
        if (this.showCollectedCoinCount) {
          this.dollarLabel.string = `${Math.round(this._countTarget)}`;
        } else {
          this.dollarLabel.string = `$${this._countTarget.toFixed(2)}`;
        }
      } else if (this._countTarget <= 0) {
        this.refreshLabelInitial();
      } else {
        this._countingUp = true;
      }
    }
  };

  /** Если пакшот создали не через WinPresenter — ищем CollectibleSpawner в сцене */
  private fallbackTotalsFromScene(): number {
    const scene = director.getScene();
    const canvas = this.findCanvasUpwards();
    let sp: CollectibleSpawner | null = null;
    if (canvas) {
      sp =
        canvas.getComponent(CollectibleSpawner) ?? canvas.getComponentInChildren(CollectibleSpawner);
    }
    if (!sp && scene) {
      sp = scene.getComponentInChildren(CollectibleSpawner);
    }
    if (!sp) return 0;
    return this.showCollectedCoinCount ? sp.getCollectedCount() : sp.getDollarTotal();
  }

  private findCanvasUpwards(): Node | null {
    let p: Node | null = this.node;
    while (p) {
      if (p.name === 'Canvas') return p;
      p = p.parent;
    }
    return null;
  }
}
