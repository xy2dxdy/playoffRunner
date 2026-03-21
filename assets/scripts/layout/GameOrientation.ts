import { screen, view, ResolutionPolicy, macro, Size } from 'cc';
export const APP_WIDTH: number = 720;
export const APP_HEIGHT: number = 1280;

export enum Orientation {
    Portrait = "Portrait",
    Landscape = "Landscape",
    Quad = "Quad"
}

export class GameOrientation {

    private static _orientation: Orientation = Orientation.Portrait;
    private static _ratio: number = -1;

    public static setResize(newSize: Size): void {

        var width = newSize.width;
        var height = newSize.height;
        const newOrientation: Orientation = width >= height ? Orientation.Landscape : Orientation.Portrait;
        if (newOrientation !== this._orientation) {
            this._orientation = newOrientation;


        }

        const ratio: number = this.isPort ? width / height : height / width;

        if (ratio !== this._ratio) {
            this._ratio = ratio;

        }


    }

    public static get orientation(): Orientation {
        return this._orientation;
    }

    public static get isPort(): boolean {
        return this._orientation == Orientation.Portrait;
    }

    public static get ratio(): number {
        return this._ratio;
    }

    public static get ceilRatio(): number {
        return Math.floor(this._ratio * 10);
    }
}

GameOrientation.setResize(new Size(screen.windowSize.width, screen.windowSize.height));