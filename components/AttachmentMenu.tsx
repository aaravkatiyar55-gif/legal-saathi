"use client";

import { FileText, Folder, Globe2, ImageIcon, Plus, Video } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { translateUiText, type AppLanguage } from "@/lib/i18n";
import { getMenuFocusIndex } from "@/lib/menuKeyboardNavigation";

type AttachmentMenuProps = {
  disabled?: boolean;
  selectedFile?: File;
  onSelect: (file?: File) => void;
  buttonClassName: string;
  webEnabled?: boolean;
  webAvailable?: boolean;
  webUnavailableMessage?: string;
  onToggleWeb?: () => void;
  language?: AppLanguage;
};

export default function AttachmentMenu({
  disabled = false,
  selectedFile,
  onSelect,
  buttonClassName,
  webEnabled = false,
  webAvailable = false,
  webUnavailableMessage,
  onToggleWeb,
  language = "en",
}: AttachmentMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const t = (text: string) => translateUiText(text, language);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerButtonRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    firstActionRef.current?.focus();
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [open]);

  const choose = (input: HTMLInputElement | null) => {
    setOpen(false);
    input?.click();
  };

  const acceptSelection = (input: HTMLInputElement, file?: File) => {
    onSelect(file);
    input.value = "";
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    const menuItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemcheckbox"]') ?? [],
    );
    const nextIndex = getMenuFocusIndex(menuItems, menuItems.indexOf(document.activeElement as HTMLButtonElement), event.key);
    if (nextIndex === null) return;
    event.preventDefault();
    menuItems[nextIndex]?.focus();
  };

  return (
    <div className="attachment-menu-wrap" ref={wrapperRef}>
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.rtf"
        className="sr-only"
        aria-label={t("Choose a legal document")}
        onChange={(event) => acceptSelection(event.currentTarget, event.currentTarget.files?.[0])}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        className="sr-only"
        aria-label={t("Choose a legal image")}
        onChange={(event) => acceptSelection(event.currentTarget, event.currentTarget.files?.[0])}
      />
      <button
        ref={triggerButtonRef}
        type="button"
        className={buttonClassName}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={selectedFile
          ? language === "hi" ? `${selectedFile.name} संलग्नक बदलें` : language === "hinglish" ? `${selectedFile.name} attachment badlein` : `Replace attachment ${selectedFile.name}`
          : t("Add attachment")}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={20} />
      </button>
      {open && (
        <div id={menuId} ref={menuRef} className="attachment-menu" role="menu" aria-label={t("Attachment type")} onKeyDown={handleMenuKeyDown}>
          <button ref={firstActionRef} type="button" role="menuitem" onClick={() => choose(documentInputRef.current)}>
            <FileText size={16} /> {t("Document")}
          </button>
          <button type="button" role="menuitem" onClick={() => choose(imageInputRef.current)}>
            <ImageIcon size={16} /> {t("Image")}
          </button>
          <button type="button" role="menuitem" disabled title={t("Folder upload requires the production malware-scanning pipeline")}>
            <Folder size={16} /> {t("Folder")}
          </button>
          <button type="button" role="menuitem" disabled title={t("Video upload requires the production media and malware-processing pipeline")}>
            <Video size={16} /> {t("Video")}
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={webEnabled}
            disabled={!webAvailable || !onToggleWeb}
            title={t(webAvailable ? "Use live Web sources for this request" : webUnavailableMessage ?? "Live web search is not configured on this environment.")}
            onClick={() => {
              onToggleWeb?.();
              closeMenu(true);
            }}
          >
            <Globe2 size={16} />
            <span>{t("Web search")}</span>
            <span className="attachment-menu-state">{t(webEnabled ? "On" : "Off")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
