import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Укажите узлы в инспекторе — при показе fail или packshot (win/lose) им выставится active = false.
 * Повесьте компонент на тот же Canvas, где WinPresenter / GameOverPresenter.
 */
@ccclass('GameEndOverlayHider')
export class GameEndOverlayHider extends Component {
  @property({
    type: [Node],
    tooltip: 'Скрыть (active = false) при открытии fail или packshot',
  })
  hideWhenEndOverlay: Node[] = [];

  public hideTargets(): void {
    for (const n of this.hideWhenEndOverlay) {
      if (n?.isValid) n.destroy();
    }
  }

  public static hideOnCanvas(canvas: Node | null): void {
    if (!canvas?.isValid) return;
    canvas.getComponent(GameEndOverlayHider)?.hideTargets();
  }
}
