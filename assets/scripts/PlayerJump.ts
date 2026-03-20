import { _decorator, Component, Node, Vec3, input, Input, EventTouch, EventMouse } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('PlayerJump')
export class PlayerJump extends Component {
  @property({ tooltip: 'Скорость прыжка (импульс вверх, px/s)' })
  jumpVelocity = 800;

  @property({ tooltip: 'Гравитация (px/s²), положительное значение тянет вниз' })
  gravity = 2500;

  @property({ tooltip: 'Y координата земли (нижняя грань игрока). Если 0 — берётся из начальной позиции.' })
  groundY = 0;

  @property({ tooltip: 'Разрешить прыжок только когда игрок на земле' })
  singleJumpOnly = true;

  private velocityY = 0;
  private fixedX = 0;
  private fixedZ = 0;
  private isGrounded = true;

  start() {
    this.fixedX = this.node.position.x;
    this.fixedZ = this.node.position.z;

    if (this.groundY === 0) {
      this.groundY = this.node.position.y;
    }

    input.on(Input.EventType.TOUCH_START, this.onJump, this);
    input.on(Input.EventType.MOUSE_DOWN, this.onJumpMouse, this);
  }

  onDestroy() {
    input.off(Input.EventType.TOUCH_START, this.onJump, this);
    input.off(Input.EventType.MOUSE_DOWN, this.onJumpMouse, this);
  }

  private onJump(_event: EventTouch) {
    this.tryJump();
  }

  private onJumpMouse(_event: EventMouse) {
    this.tryJump();
  }

  private tryJump() {
    if (this.singleJumpOnly && !this.isGrounded) return;

    this.velocityY = this.jumpVelocity;
    this.isGrounded = false;
  }

  update(dt: number) {
    if (this.isGrounded && this.velocityY <= 0) return;

    this.velocityY -= this.gravity * dt;

    let newY = this.node.position.y + this.velocityY * dt;

    if (newY <= this.groundY) {
      newY = this.groundY;
      this.velocityY = 0;
      this.isGrounded = true;
    }

    this.node.setPosition(new Vec3(this.fixedX, newY, this.fixedZ));
  }
}
