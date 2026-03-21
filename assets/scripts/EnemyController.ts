import { _decorator, Component, UITransform, Vec3, Animation } from 'cc';
import { GamePause } from './GamePause';
const { ccclass, property } = _decorator;

@ccclass('EnemyController')
export class EnemyController extends Component {
  @property({ tooltip: 'Скорость врага влево (px/s). Должна быть больше scrollSpeed платформы.' })
  speed = 650;

  @property({ tooltip: 'Марджин за левым краем, после которого враг уничтожается (px).' })
  offscreenMargin = 200;

  private leftLimitX = -999999;
  private inited = false;
  private pauseSynced = false;

  start() {
    this.updateLeftLimitFromCanvas();
    this.syncAnimationWithGlobalPause();
  }

  /** Ширина экрана — у Canvas (родитель). Иначе getComponentInParent часто берёт UITransform самого врага (ширина спрайта), и граница сброса неверная. */
  private updateLeftLimitFromCanvas() {
    const canvasUi = this.node.parent?.getComponent(UITransform);
    const ui = canvasUi ?? this.node.getComponentInParent(UITransform);
    if (ui) {
      const w = ui.contentSize.width;
      this.leftLimitX = -w / 2 - this.offscreenMargin;
      this.inited = true;
    }
  }

  private syncAnimationWithGlobalPause() {
    const paused = GamePause.paused;
    const anim = this.node.getComponent(Animation);
    if (anim) {
      if (paused) anim.pause();
      else anim.resume();
    }
    this.pauseSynced = paused;
  }

  update(dt: number) {
    this.updateLeftLimitFromCanvas();

    const paused = GamePause.paused;
    if (paused !== this.pauseSynced) {
      const anim = this.node.getComponent(Animation);
      if (anim) {
        if (paused) anim.pause();
        else anim.resume();
      }
      this.pauseSynced = paused;
    }
    if (paused) return;

    const p = this.node.position;
    this.node.setPosition(new Vec3(p.x - this.speed * dt, p.y, p.z));

    if (this.inited && this.node.position.x < this.leftLimitX) {
      this.node.destroy();
    }
  }

}

