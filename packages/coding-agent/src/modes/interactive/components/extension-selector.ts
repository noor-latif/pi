/**
 * Generic selector component for extensions.
 * Displays a list of string options with keyboard navigation.
 */

import { Container, getKeybindings, Spacer, Text, type TUI } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.ts";
import { CountdownTimer } from "./countdown-timer.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyHint, rawKeyHint } from "./keybinding-hints.ts";

export interface ExtensionSelectorOptions {
	tui?: TUI;
	timeout?: number;
	onToggleToolsExpanded?: () => void;
	maxHeight?: (width: number) => number;
}

export class ExtensionSelectorComponent extends Container {
	private options: string[];
	private selectedIndex = 0;
	private listContainer: Container;
	private onSelectCallback: (option: string) => void;
	private onCancelCallback: () => void;
	private titleText: Text;
	private baseTitle: string;
	private countdown: CountdownTimer | undefined;
	private onToggleToolsExpanded: (() => void) | undefined;
	private maxHeight: ((width: number) => number) | undefined;

	constructor(
		title: string,
		options: string[],
		onSelect: (option: string) => void,
		onCancel: () => void,
		opts?: ExtensionSelectorOptions,
	) {
		super();

		this.options = options;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;
		this.onToggleToolsExpanded = opts?.onToggleToolsExpanded;
		this.maxHeight = opts?.maxHeight;
		this.baseTitle = title;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		this.titleText = new Text(theme.fg("accent", theme.bold(title)), 1, 0);
		this.addChild(this.titleText);
		this.addChild(new Spacer(1));

		if (opts?.timeout && opts.timeout > 0 && opts.tui) {
			this.countdown = new CountdownTimer(
				opts.timeout,
				opts.tui,
				(s) => this.titleText.setText(theme.fg("accent", theme.bold(`${this.baseTitle} (${s}s)`))),
				() => this.onCancelCallback(),
			);
		}

		this.listContainer = new Container();
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				rawKeyHint("↑↓", "navigate") +
					"  " +
					keyHint("tui.select.confirm", "select") +
					"  " +
					keyHint("tui.select.cancel", "cancel"),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());

		this.updateList();
	}

	override render(width: number): string[] {
		// Preserve the original Container rendering unless the dialog would exceed
		// the terminal-height budget provided by InteractiveMode.
		const lines = super.render(width);
		const maxHeight = this.maxHeight?.(width);
		if (maxHeight === undefined || lines.length <= maxHeight) return lines;

		// When clipping, rebuild the dialog semantically instead of slicing `lines`:
		// the long title/message is disposable, but options and key hints must stay usable.
		const border = new DynamicBorder().render(width)[0]!;
		const hint = new Text(
			rawKeyHint("↑↓", "navigate") +
				"  " +
				keyHint("tui.select.confirm", "select") +
				"  " +
				keyHint("tui.select.cancel", "cancel"),
			1,
			0,
		).render(width);

		// Render options as per-option groups, not flattened rows. Wrapped options can
		// span multiple rows, while selectedIndex is an option index.
		const optionGroups = this.listContainer.children.map((child) => child.render(width));
		const optionRows = Math.max(1, Math.floor(maxHeight) - 2 - hint.length - 2);
		let firstOption = this.selectedIndex;
		let lastOption = this.selectedIndex + 1;
		let visibleOptionRows = optionGroups[this.selectedIndex]?.length ?? 0;
		while (lastOption < optionGroups.length && visibleOptionRows + optionGroups[lastOption]!.length <= optionRows) {
			visibleOptionRows += optionGroups[lastOption]!.length;
			lastOption++;
		}
		while (firstOption > 0 && visibleOptionRows + optionGroups[firstOption - 1]!.length <= optionRows) {
			firstOption--;
			visibleOptionRows += optionGroups[firstOption]!.length;
		}
		const visibleOptions = optionGroups.slice(firstOption, lastOption).flat().slice(0, optionRows);		

		// Give all remaining rows to the title/message and mark when it is clipped.
		const fixedRows = 2 + hint.length + visibleOptions.length;
		const titleRows = Math.max(0, Math.floor(maxHeight) - fixedRows);
		const titleLines = this.titleText.render(width);
		const clippedIndicator = new Text(theme.fg("muted", "[increase terminal height to see remaining dialog text]"), 1, 0).render(width)[0];
		const clippedTitle =
			titleLines.length > titleRows && titleRows > 1 && clippedIndicator
				? [...titleLines.slice(0, titleRows - 1), clippedIndicator]
				: titleLines.slice(0, titleRows);

		return [border, ...clippedTitle, ...visibleOptions, ...hint, border].slice(0, Math.max(1, Math.floor(maxHeight)));
	}

	private updateList(): void {
		this.listContainer.clear();
		for (let i = 0; i < this.options.length; i++) {
			const isSelected = i === this.selectedIndex;
			const text = isSelected
				? theme.fg("accent", "→ ") + theme.fg("accent", this.options[i])
				: `  ${theme.fg("text", this.options[i])}`;
			this.listContainer.addChild(new Text(text, 1, 0));
		}
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (kb.matches(keyData, "app.tools.expand")) {
			this.onToggleToolsExpanded?.();
		} else if (kb.matches(keyData, "tui.select.up") || keyData === "k") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.down") || keyData === "j") {
			this.selectedIndex = Math.min(this.options.length - 1, this.selectedIndex + 1);
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
			const selected = this.options[this.selectedIndex];
			if (selected) this.onSelectCallback(selected);
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
		}
	}

	dispose(): void {
		this.countdown?.dispose();
	}
}
