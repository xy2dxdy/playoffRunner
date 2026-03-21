export const TUTORIAL_JUMP_DONE = 'tutorial-jump-done';

export class GamePause {
  private static _paused = false;

  static get paused(): boolean {
    return this._paused;
  }

  static setPaused(v: boolean): void {
    this._paused = v;
  }
}
