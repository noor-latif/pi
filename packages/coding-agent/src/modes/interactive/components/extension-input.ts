/**
 * Simple text input component for extensions.
 */

import { Container, type Focusable, getKeybindings, Input, Spacer, Text, type TUI } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.ts";
import { CountdownTimer } from "./countdown-timer.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyHint } from "./keybinding-hints.ts";

export interface ExtensionInputOptions {
	tui?: TUI;
	timeout?: number;
	maxHeight?: (width: number) => number;
}

export class ExtensionInputComponent extends Container implements Focusable {
	private input: Input;
	private onSubmitCallback: (value: string) => void;
	private onCancelCallback: () => void;
	private titleText: Text;
	private baseTitle: string;
	private countdown: CountdownTimer | undefined;
	private maxHeight: ((width: number) => number) | undefined;

	// Focusable implementation - propagate to input for IME cursor positioning
	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	constructor(
		title: string,
		_placeholder: string | undefined,
		onSubmit: (value: string) => void,
		onCancel: () => void,
		opts?: ExtensionInputOptions,
	) {
		super();

		this.onSubmitCallback = onSubmit;
		this.onCancelCallback = onCancel;
		this.maxHeight = opts?.maxHeight;
		this.baseTitle = title;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		this.titleText = new Text(theme.fg("accent", title), 1, 0);
		this.addChild(this.titleText);
		this.addChild(new Spacer(1));

		if (opts?.timeout && opts.timeout > 0 && opts.tui) {
			this.countdown = new CountdownTimer(
				opts.timeout,
				opts.tui,
				(s) => this.titleText.setText(theme.fg("accent", `${this.baseTitle} (${s}s)`)),
				() => this.onCancelCallback(),
			);
		}

		this.input = new Input();
		this.addChild(this.input);
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(`${keyHint("tui.select.confirm", "submit")}  ${keyHint("tui.select.cancel", "cancel")}`, 1, 0),
		);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	override render(width: number): string[] {
		// Preserve the original Container rendering unless the dialog would exceed
		// the terminal-height budget provided by InteractiveMode.
		const lines = super.render(width);
		const maxHeight = this.maxHeight?.(width);
		if (maxHeight === undefined || lines.length <= maxHeight) return lines;

		// When clipping, rebuild the dialog semantically: clip the title/prompt but
		// always keep the input row and key hints visible.
		const border = new DynamicBorder().render(width)[0]!;
		const inputLines = this.input.render(width);
		const hint = new Text(
			`${keyHint("tui.select.confirm", "submit")}  ${keyHint("tui.select.cancel", "cancel")}`,
			1,
			0,
		).render(width);

		// Give all remaining rows to the title/prompt and mark when it is clipped.
		const fixedRows = 2 + inputLines.length + hint.length;
		const titleRows = Math.max(0, Math.floor(maxHeight) - fixedRows);
		const titleLines = this.titleText.render(width);
		const clippedIndicator = new Text(theme.fg("muted", "[increase terminal height to see full input text]"), 1, 0).render(width)[0];
		const clippedTitle =
			titleLines.length > titleRows && titleRows > 1 && clippedIndicator
				? [...titleLines.slice(0, titleRows - 1), clippedIndicator]
				: titleLines.slice(0, titleRows);

		return [border, ...clippedTitle, ...inputLines, ...hint, border].slice(0, Math.max(1, Math.floor(maxHeight)));
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
			this.onSubmitCallback(this.input.getValue());
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
		} else {
			this.input.handleInput(keyData);
		}
	}

	dispose(): void {
		this.countdown?.dispose();
	}
}
