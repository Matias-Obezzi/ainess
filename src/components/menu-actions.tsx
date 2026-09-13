// One list of actions, two menus: the three-dot dropdown and the right-click context menu render
// the same items so they can never drift apart.
import { Fragment } from "react";
import { ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@/components/ui/context-menu";
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";

export interface MenuAction {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect(): void;
  /** Shown but not clickable: an action that does not apply right now. */
  disabled?: boolean;
  destructive?: boolean;
  /** Draws a separator above this item. */
  separatorBefore?: boolean;
  /** A submenu instead of an action: `onSelect` is not called for an item with children. */
  children?: MenuAction[];
}

/** Renders `actions` as dropdown menu items. */
export function DropdownActionItems({ actions }: { actions: MenuAction[] }) {
  return (
    <>
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <Fragment key={action.key}>
            {action.separatorBefore && <DropdownMenuSeparator />}
            {action.children ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={action.disabled}>{Icon && <Icon />} {action.label}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent><DropdownActionItems actions={action.children} /></DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
            <DropdownMenuItem
              disabled={action.disabled}
              variant={action.destructive ? "destructive" : "default"}
              onSelect={() => action.onSelect()}
            >
              {Icon && <Icon />} {action.label}
            </DropdownMenuItem>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/** Renders `actions` as context menu items. */
export function ContextActionItems({ actions }: { actions: MenuAction[] }) {
  return (
    <>
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <Fragment key={action.key}>
            {action.separatorBefore && <ContextMenuSeparator />}
            {action.children ? (
              <ContextMenuSub>
                <ContextMenuSubTrigger disabled={action.disabled}>{Icon && <Icon />} {action.label}</ContextMenuSubTrigger>
                <ContextMenuSubContent><ContextActionItems actions={action.children} /></ContextMenuSubContent>
              </ContextMenuSub>
            ) : (
            <ContextMenuItem
              disabled={action.disabled}
              variant={action.destructive ? "destructive" : "default"}
              onSelect={() => action.onSelect()}
            >
              {Icon && <Icon />} {action.label}
            </ContextMenuItem>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
