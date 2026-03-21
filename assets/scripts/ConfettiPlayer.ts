import { _decorator, Component, Node, Sprite, SpriteFrame, Vec3, tween, UIOpacity, Color, randomRange, randomRangeInt } from 'cc';


const { ccclass, property } = _decorator;

/**
 * Интерфейс для частицы конфетти
 */
interface ConfettiParticle {
    node: Node;
    velocity: Vec3;
    angularVelocity: number;
    lifeTime: number;
    maxLifeTime: number;
    gravity: number;
    drag: number;
    color: Color;
    scale: number;
}

/**
 * Класс для создания эффекта взрыва хлопушки с разлетающимися частицами конфетти
 * Создает множество частиц, которые разлетаются в разные стороны с физикой
 */
@ccclass('ConfettiPlayer')
export class ConfettiPlayer extends Component {

    @property([SpriteFrame])
    private confettiSprites: SpriteFrame[] = [];

    @property(Number)
    private particleCount: number = 120;

    @property(Number)
    private explosionForce: number = 500;

    @property(Number)
    private particleLifeTime: number = 4;

    @property({ type: Number })
    spawnDurationSec = 2.5;

    @property(Number)
    private gravity: number = -200;

    @property(Number)
    private drag: number = 0.98;

    @property(Number)
    private angularVelocityRange: number = 360;

    @property(Number)
    private scaleRange: number = 0.5;

    @property(Number)
    private minScale: number = 0.3;

    @property(Number)
    private maxScale: number = 1.0;

    @property(Boolean)
    private playSound: boolean = true;

    @property(Boolean)
    private randomColors: boolean = true;

    @property({ type: Boolean })
    dualSideSpawn = true;

    @property({ type: Number })
    sideSpawnOffset = 380;

    @property([Color])
    private particleColors: Color[] = [
        new Color(255, 0, 0, 255),    // Красный
        new Color(0, 255, 0, 255),    // Зеленый
        new Color(0, 0, 255, 255),    // Синий
        new Color(255, 255, 0, 255),  // Желтый
        new Color(255, 0, 255, 255),  // Пурпурный
        new Color(0, 255, 255, 255),  // Голубой
        new Color(255, 165, 0, 255),  // Оранжевый
        new Color(255, 192, 203, 255)  // Розовый
    ];

    private particles: ConfettiParticle[] = [];
    private isPlaying: boolean = false;
    private parentNode: Node = null!;

    private spawnCenter = new Vec3();
    private spawnQueueRemaining = 0;
    private spawnCredit = 0;
    private isSpawning = false;

    protected override onLoad(): void {
        this.parentNode = this.node;
    }

    /**
     * Запускает эффект взрыва хлопушки
     * @param position - позиция взрыва (если не указана, используется позиция компонента)
     */
    public play(): void {


        if (this.confettiSprites.length === 0) {
            console.warn('ConfettiPlayer: Нет спрайтов конфетти для воспроизведения');
            return;
        }

        this.clearParticles();
        this.isSpawning = false;
        this.spawnQueueRemaining = 0;
        this.spawnCredit = 0;

        this.isPlaying = true;
        const explosionPos = this.node.worldPosition.clone();

        if (this.spawnDurationSec <= 0.001) {
            this.createParticlesInstant(explosionPos);
        } else {
            this.spawnCenter.set(explosionPos);
            this.spawnQueueRemaining = this.particleCount;
            this.spawnCredit = 0;
            this.isSpawning = true;
        }

        console.log(`ConfettiPlayer: Запуск эффекта взрыва с ${this.particleCount} частицами`);
    }

    private createParticlesInstant(explosionPos: Vec3): void {
        if (!this.dualSideSpawn) {
            for (let i = 0; i < this.particleCount; i++) {
                this.createParticle(explosionPos, 'omni');
            }
            return;
        }
        const pairs = Math.floor(this.particleCount / 2);
        for (let p = 0; p < pairs; p++) {
            this.spawnPairAt(explosionPos);
        }
        if (this.particleCount % 2 === 1) {
            const spawnPos = explosionPos.clone();
            spawnPos.x -= this.sideSpawnOffset;
            this.createParticle(spawnPos, 'fromLeft');
        }
    }

    private spawnPairAt(center: Vec3): void {
        const spawnL = center.clone();
        spawnL.x -= this.sideSpawnOffset;
        const spawnR = center.clone();
        spawnR.x += this.sideSpawnOffset;
        this.createParticle(spawnL, 'fromLeft');
        this.createParticle(spawnR, 'fromRight');
    }

    private createParticle(
        spawnWorldPos: Vec3,
        mode: 'omni' | 'fromLeft' | 'fromRight'
    ): void {
        // Создаем узел для частицы
        const particleNode = new Node('ConfettiParticle');
        particleNode.setParent(this.parentNode);
        particleNode.setWorldPosition(spawnWorldPos);

        // Добавляем спрайт
        const sprite = particleNode.addComponent(Sprite);
        const randomSprite = this.confettiSprites[randomRangeInt(0, this.confettiSprites.length)];
        sprite.spriteFrame = randomSprite;

        // Добавляем компонент прозрачности
        const opacity = particleNode.addComponent(UIOpacity);
        opacity.opacity = 255;

        let angle: number;
        let vyExtra: number;
        if (mode === 'omni') {
            angle = randomRange(0, Math.PI * 2);
            vyExtra = randomRange(-100, 100);
        } else if (mode === 'fromLeft') {
            angle = randomRange(Math.PI / 5, Math.PI / 2 - 0.06);
            vyExtra = randomRange(120, 280);
        } else {
            angle = randomRange(Math.PI / 2 + 0.06, (5 * Math.PI) / 6);
            vyExtra = randomRange(120, 280);
        }
        const force = randomRange(this.explosionForce * 0.5, this.explosionForce);
        const velocity = new Vec3(
            Math.cos(angle) * force,
            Math.sin(angle) * force + vyExtra,
            randomRange(-50, 50)
        );

        // Случайные параметры
        const angularVelocity = randomRange(-this.angularVelocityRange, this.angularVelocityRange);
        const lifeTime = randomRange(this.particleLifeTime * 0.7, this.particleLifeTime * 1.3);
        const scale = randomRange(this.minScale, this.maxScale);

        // Случайный цвет
        let color = Color.WHITE.clone();
        if (this.randomColors && this.particleColors.length > 0) {
            const randomColorIndex = randomRangeInt(0, this.particleColors.length);
            color = this.particleColors[randomColorIndex].clone();
        }

        // Применяем цвет к спрайту
        sprite.color = color;

        // Устанавливаем масштаб
        particleNode.setScale(scale, scale, scale);

        // Создаем объект частицы
        const particle: ConfettiParticle = {
            node: particleNode,
            velocity: velocity,
            angularVelocity: angularVelocity,
            lifeTime: lifeTime,
            maxLifeTime: lifeTime,
            gravity: this.gravity,
            drag: this.drag,
            color: color,
            scale: scale
        };

        this.particles.push(particle);
    }

    /**
     * Обновление физики частиц
     */
    protected override update(deltaTime: number): void {
        if (!this.isPlaying) return;

        if (this.isSpawning && this.spawnQueueRemaining > 0) {
            const dur = Math.max(0.001, this.spawnDurationSec);
            const rate = this.particleCount / dur;
            this.spawnCredit += rate * deltaTime;
            if (this.dualSideSpawn) {
                while (this.spawnCredit >= 2 && this.spawnQueueRemaining >= 2) {
                    this.spawnPairAt(this.spawnCenter);
                    this.spawnCredit -= 2;
                    this.spawnQueueRemaining -= 2;
                }
                if (this.spawnQueueRemaining === 1 && this.spawnCredit >= 1) {
                    const spawnPos = this.spawnCenter.clone();
                    spawnPos.x -= this.sideSpawnOffset;
                    this.createParticle(spawnPos, 'fromLeft');
                    this.spawnQueueRemaining = 0;
                    this.spawnCredit -= 1;
                }
            } else {
                while (this.spawnCredit >= 1 && this.spawnQueueRemaining > 0) {
                    this.createParticle(this.spawnCenter, 'omni');
                    this.spawnCredit -= 1;
                    this.spawnQueueRemaining--;
                }
            }
            if (this.spawnQueueRemaining <= 0) {
                this.isSpawning = false;
            }
        }

        let activeParticles = 0;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];

            if (!particle.node || !particle.node.isValid) {
                this.particles.splice(i, 1);
                continue;
            }

            // Обновляем время жизни
            particle.lifeTime -= deltaTime;

            if (particle.lifeTime <= 0) {
                // Удаляем частицу
                particle.node.destroy();
                this.particles.splice(i, 1);
                continue;
            }

            // Обновляем физику
            this.updateParticlePhysics(particle, deltaTime);
            activeParticles++;
        }

        if (activeParticles === 0 && !this.isSpawning) {
            this.isPlaying = false;
            console.log('ConfettiPlayer: Эффект завершен');
        }
    }

    /**
     * Обновляет физику одной частицы
     */
    private updateParticlePhysics(particle: ConfettiParticle, deltaTime: number): void {
        // Применяем гравитацию
        particle.velocity.y += particle.gravity * deltaTime;

        // Применяем сопротивление
        particle.velocity.multiplyScalar(particle.drag);

        // Обновляем позицию
        const newPos = particle.node.worldPosition.clone();
        newPos.add3f(
            particle.velocity.x * deltaTime,
            particle.velocity.y * deltaTime,
            particle.velocity.z * deltaTime
        );
        particle.node.setWorldPosition(newPos);

        // Обновляем вращение
        const currentRotation = particle.node.eulerAngles;
        particle.node.setRotationFromEuler(
            currentRotation.x,
            currentRotation.y,
            currentRotation.z + particle.angularVelocity * deltaTime
        );

        // Обновляем прозрачность в зависимости от времени жизни
        const opacity = particle.node.getComponent(UIOpacity);
        if (opacity) {
            const lifeRatio = particle.lifeTime / particle.maxLifeTime;
            opacity.opacity = Math.floor(255 * lifeRatio);
        }
    }

    /**
     * Очищает все частицы
     */
    private clearParticles(): void {
        for (const particle of this.particles) {
            if (particle.node && particle.node.isValid) {
                particle.node.destroy();
            }
        }
        this.particles = [];
    }

    /**
     * Останавливает эффект и очищает все частицы
     */
    public stopConfetti(): void {
        this.isPlaying = false;
        this.isSpawning = false;
        this.spawnQueueRemaining = 0;
        this.spawnCredit = 0;
        this.clearParticles();
    }

    /**
     * Проверяет, воспроизводится ли эффект
     */
    public isConfettiPlaying(): boolean {
        return this.isPlaying;
    }

    /**
     * Устанавливает спрайты конфетти
     */
    public setConfettiSprites(sprites: SpriteFrame[]): void {
        this.confettiSprites = sprites;
    }

    /**
     * Устанавливает количество частиц
     */
    public setParticleCount(count: number): void {
        this.particleCount = Math.max(1, count);
    }

    /**
     * Устанавливает силу взрыва
     */
    public setExplosionForce(force: number): void {
        this.explosionForce = Math.max(0, force);
    }

    /**
     * Устанавливает время жизни частиц
     */
    public setParticleLifeTime(time: number): void {
        this.particleLifeTime = Math.max(0.1, time);
    }

    /**
     * Устанавливает гравитацию
     */
    public setGravity(gravity: number): void {
        this.gravity = gravity;
    }

    /**
     * Устанавливает сопротивление
     */
    public setDrag(drag: number): void {
        this.drag = Math.max(0, Math.min(1, drag));
    }

    /**
     * Устанавливает цвета частиц
     */
    public setParticleColors(colors: Color[]): void {
        this.particleColors = colors;
    }

    /**
     * Включает/выключает случайные цвета
     */
    public setRandomColors(enabled: boolean): void {
        this.randomColors = enabled;
    }

    /**
     * Включает/выключает воспроизведение звука
     */
    public setPlaySound(enabled: boolean): void {
        this.playSound = enabled;
    }

    protected override onDestroy(): void {
        this.stopConfetti();
    }
}
