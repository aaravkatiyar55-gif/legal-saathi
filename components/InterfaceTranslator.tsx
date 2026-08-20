"use client";

import { useEffect } from "react";
import { translateUiText, type AppLanguage } from "@/lib/i18n";
import { syncDocumentLanguage } from "@/lib/i18n/appCopy";

type OriginalValue = { original: string; rendered: string };

const textValues = new WeakMap<Text, OriginalValue>();
const attributeValues = new WeakMap<Element, Map<string, OriginalValue>>();
const translatableAttributes = ["placeholder", "title", "aria-label"] as const;

function translateTree(root: Node, language: AppLanguage) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    if (parent && !parent.closest("script, style, noscript, [data-no-i18n]")) {
      const previous = textValues.get(textNode);
      const current = textNode.data;
      const original = previous && previous.rendered === current ? previous.original : current;
      const rendered = translateUiText(original, language);
      if (rendered !== current) textNode.data = rendered;
      textValues.set(textNode, { original, rendered });
    }
    node = walker.nextNode();
  }

  const elements = root instanceof Element
    ? [root, ...Array.from(root.querySelectorAll("[placeholder], [title], [aria-label]"))]
    : Array.from(document.querySelectorAll("[placeholder], [title], [aria-label]"));
  for (const element of elements) {
    if (element.closest("script, style, noscript, [data-no-i18n]")) continue;
    let values = attributeValues.get(element);
    if (!values) {
      values = new Map();
      attributeValues.set(element, values);
    }
    for (const attribute of translatableAttributes) {
      const current = element.getAttribute(attribute);
      if (!current) continue;
      const previous = values.get(attribute);
      const original = previous && previous.rendered === current ? previous.original : current;
      const rendered = translateUiText(original, language);
      if (rendered !== current) element.setAttribute(attribute, rendered);
      values.set(attribute, { original, rendered });
    }
  }
}

export default function InterfaceTranslator({ language }: { language: AppLanguage }) {
  useEffect(() => {
    const root = document.body;
    let scheduled = false;
    const apply = () => {
      scheduled = false;
      translateTree(root, language);
      syncDocumentLanguage(language);
    };
    const schedule = () => {
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(apply);
      }
    };

    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...translatableAttributes] });
    return () => observer.disconnect();
  }, [language]);

  return null;
}
