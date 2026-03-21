import {
  _decorator,
  Component,
  Node,
  Vec3,
  input,
  Input,
  EventTouch,
  EventMouse,
  Animation,
  Sprite,
  Color,
} from 'cc';
import { GamePause, TUTORIAL_JUMP_DONE } from './GamePause';
import { SoundController } from './SoundController';
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

  @property({ tooltip: 'Имя анимации idle в компоненте Animation' })
  idleAnim = 'idle';

  @property({ tooltip: 'Имя анимации run в компоненте Animation' })
  runAnim = 'run';

  @property({ tooltip: 'Имя анимации jump в компоненте Animation' })
  jumpAnim = 'jump';

  @property({ tooltip: 'Имя анимации damage в компоненте Animation' })
  damageAnim = 'damage';

  private velocityY = 0;
  private fixedX = 0;
  private fixedZ = 0;
  private isGrounded = true;

  private anim: Animation | null = null;
  private currentAnim = '';
  private damageTimer = 0;

  private sprite: Sprite | null = null;
  private baseColor: Color | null = null;

  private jumpInputEnabled = false;
  private tutorialPause = false;

  @property({ tooltip: 'Цвет урона (на время неуязвимости)' })
  damageColor = new Color(255, 0, 0, 255);

  @property({ tooltip: 'Сколько секунд игрок будет красным после урона' })
  damageFlashDurationSec = 0.35;

  start() {
    this.fixedX = this.node.position.x;
    this.fixedZ = this.node.position.z;

    this.anim = this.node.getComponent(Animation);
    if (GamePause.paused) {
      this.playAnim(this.idleAnim);
    } else {
      this.playAnim(this.runAnim);
    }

    this.sprite = this.node.getComponent(Sprite);
    if (this.sprite) {
      const c = this.sprite.color;
      this.baseColor = new Color(c.r, c.g, c.b, c.a);
    }

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
    if (!this.jumpInputEnabled) return;
    if (GamePause.paused && !this.tutorialPause) return;
    if (this.singleJumpOnly && !this.isGrounded) return;

    this.velocityY = this.jumpVelocity;
    this.isGrounded = false;
    this.playAnim(this.jumpAnim);
    SoundController.instance?.playJump();

    if (this.tutorialPause) {
      this.node.emit(TUTORIAL_JUMP_DONE);
    }
  }

  public setJumpInputEnabled(enabled: boolean) {
    this.jumpInputEnabled = enabled;
  }

  public setTutorialPause(v: boolean) {
    this.tutorialPause = v;
    if (v) {
      this.playAnim(this.idleAnim);
    }
  }

  update(dt: number) {
    if (this.tutorialPause) {
      if (this.damageTimer > 0) {
        this.damageTimer -= dt;
        if (this.damageTimer <= 0) {
          this.damageTimer = 0;
          if (this.sprite && this.baseColor) {
            this.sprite.color = this.baseColor;
          }
        }
      }
      if (this.damageTimer > 0) {
        this.playAnim(this.damageAnim);
        return;
      }
      this.playAnim(this.idleAnim);
      return;
    }

    if (GamePause.paused) {
      this.tickDamageTimer(dt);
      this.applyJumpPhysics(dt);
      if (this.damageTimer > 0) {
        this.playAnim(this.damageAnim);
        return;
      }
      if (!this.isGrounded) {
        this.playAnim(this.jumpAnim);
      } else {
        this.playAnim(this.idleAnim);
      }
      return;
    }

    this.tickDamageTimer(dt);

    this.applyJumpPhysics(dt);

    if (this.damageTimer > 0) {
      this.playAnim(this.damageAnim);
      return;
    }

    if (!this.isGrounded) this.playAnim(this.jumpAnim);
    else this.playAnim(this.runAnim);
  }

  private tickDamageTimer(dt: number) {
    if (this.damageTimer > 0) {
      this.damageTimer -= dt;
      if (this.damageTimer <= 0) {
        this.damageTimer = 0;
        if (this.sprite && this.baseColor) {
          this.sprite.color = this.baseColor;
        }
      }
    }
  }

  private applyJumpPhysics(dt: number) {
    const needPhysics = !(this.isGrounded && this.velocityY <= 0);
    if (!needPhysics) return;

    this.velocityY -= this.gravity * dt;

    let newY = this.node.position.y + this.velocityY * dt;

    if (newY <= this.groundY) {
      newY = this.groundY;
      this.velocityY = 0;
      this.isGrounded = true;
    }

    this.node.setPosition(new Vec3(this.fixedX, newY, this.fixedZ));
  }

  private playAnim(name: string) {
    if (!this.anim) return;
    if (!name) return;
    if (this.currentAnim === name) return;
    this.currentAnim = name;
    this.anim.play(name);
  }

  public triggerDamage(durationSec?: number) {
    this.damageTimer = durationSec ?? this.damageFlashDurationSec;
    if (this.sprite) this.sprite.color = this.damageColor;
    this.playAnim(this.damageAnim);
  }
}
