import { _decorator, Component, UITransform, Vec3, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('EnemyController')
export class EnemyController extends Component {
  @property({ tooltip: 'Скорость врага влево (px/s). Должна быть больше scrollSpeed платформы.' })
  speed = 650;

  @property({ tooltip: 'Марджин за левым краем, после которого враг уничтожается (px).' })
  offscreenMargin = 200;

  private leftLimitX = -999999;
  private inited = false;

  start() {
    this.tryInitLimits();
  }

  private tryInitLimits() {
    const ui = this.node.getComponentInParent(UITransform);
    if (ui) {
      const w = ui.contentSize.width;
      this.leftLimitX = -w / 2 - this.offscreenMargin;
      this.inited = true;
    }
  }

  update(dt: number) {
    const p = this.node.position;
    this.node.setPosition(new Vec3(p.x - this.speed * dt, p.y, p.z));

    if (this.inited && this.node.position.x < this.leftLimitX) {
      this.node.destroy();
    }
  }

}

