export declare function getToggleState(key: string): boolean

export declare function isKeyDown(key: string): boolean

export declare function isMouseDown(button: string): boolean

export declare function keyDown(key: string): void

export declare function keyTap(key: string, delayMs?: number | undefined | null): void

export declare function keyUp(key: string): void

export declare function mouseClick(button: string, delayMs?: number | undefined | null): void

export declare function mouseDown(button: string): void

export declare function mouseMoveBy(dx: number, dy: number): void

export declare function mouseMoveTo(x: number, y: number): void

export declare function mousePosition(): Array<number>

export declare function mouseUp(button: string): void

export declare function mouseWheel(amount: number): void

export declare function startHook(callback: (err: any, json: string) => void): void

export declare function startX2Loop(sab: Int32Array, x2HeldSlot: number, gameOnGroundSlot: number, skillEnabledSlot: number, gameSkillReadySlot: number, boomjump: boolean): void

export declare function stopHook(): void

export declare function stopX2Loop(): void

export declare function writeText(text: string, charDelayMs?: number | undefined | null): void
