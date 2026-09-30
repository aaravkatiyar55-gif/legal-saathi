"use client";

import { useState } from "react";
import type { AppLanguage } from "@/lib/i18n";
import { EMPTY_PREPARATION_NOTE, formatPreparationNote, hasPreparationNote } from "@/lib/preparationNote";
import styles from "./PreparationNote.module.css";

export const preparationNoteCopy = {
  en: {
    title: "Make a note before you ask", intro: "Put the dates, records and one question in order. Short, factual notes are easier to take to an advocate.",
    timeline: "What happened, and when?", records: "Which records do you have?", question: "What do you want to ask?",
    privacy: "This note stays in this page's memory. It is not sent to AI or saved by this tool. Leaving or reloading loses it; a download stays on your device. Use made-up details for a demo and avoid names, IDs and account numbers.",
    download: "Download my note (.txt)", clear: "Clear note", downloaded: "Download started. Keep the file somewhere private.", cleared: "Note cleared.",
    boundary: "Personal preparation draft — not legal advice, a filing, or a deadline assessment.",
    checklist: "Preparation checklist", exercise: "Clarity exercise", journey: "Case journey", note: "My note", nav: "Try the preparation tools",
  },
  hi: {
    title: "पूछने से पहले एक नोट बनाएँ", intro: "तारीखें, रिकॉर्ड और एक सवाल क्रम से लिखें। छोटे, तथ्यपूर्ण नोट किसी अधिवक्ता से बात करने में मदद करते हैं।",
    timeline: "क्या हुआ और कब?", records: "आपके पास कौन से रिकॉर्ड हैं?", question: "आप क्या पूछना चाहते हैं?",
    privacy: "यह नोट केवल इस पेज की मेमोरी में रहता है। यह टूल इसे AI को नहीं भेजता और सहेजता नहीं है। पेज छोड़ने या रीलोड करने पर नोट खो जाएगा; डाउनलोड की गई फ़ाइल आपके डिवाइस पर रहेगी। डेमो में काल्पनिक जानकारी लिखें और नाम, पहचान व खाता नंबर न डालें।",
    download: "मेरा नोट डाउनलोड करें (.txt)", clear: "नोट साफ़ करें", downloaded: "डाउनलोड शुरू हुआ। फ़ाइल निजी जगह पर रखें।", cleared: "नोट साफ़ कर दिया।",
    boundary: "निजी तैयारी का मसौदा — कानूनी सलाह, दाखिल किया गया दस्तावेज़ या समय-सीमा का आकलन नहीं।",
    checklist: "तैयारी सूची", exercise: "स्पष्टता अभ्यास", journey: "मामले की यात्रा", note: "मेरा नोट", nav: "तैयारी के टूल आज़माएँ",
  },
  hinglish: {
    title: "Poochhne se pehle apna note banao", intro: "Dates, records aur ek sawaal ko order mein likho. Chhote factual notes advocate se baat karne mein madad karte hain.",
    timeline: "Kya hua, aur kab?", records: "Tumhare paas kaun se records hain?", question: "Tum kya poochhna chahte ho?",
    privacy: "Yeh note sirf is page ki memory mein rehta hai. Yeh tool ise AI ko nahi bhejta aur save nahi karta. Page chhodne ya reload par note chala jayega; downloaded file device par rahegi. Demo mein made-up details likho; names, IDs aur account numbers mat daalo.",
    download: "Mera note download karo (.txt)", clear: "Note clear karo", downloaded: "Download shuru hua. File ko private jagah rakho.", cleared: "Note clear ho gaya.",
    boundary: "Personal preparation draft — legal advice, filing ya deadline assessment nahi.",
    checklist: "Preparation checklist", exercise: "Clarity exercise", journey: "Case journey", note: "Mera note", nav: "Preparation tools try karo",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

export default function PreparationNote({ language }: { language: AppLanguage }) {
  const [note, setNote] = useState(EMPTY_PREPARATION_NOTE);
  const [status, setStatus] = useState<"downloaded" | "cleared" | null>(null);
  const copy = preparationNoteCopy[language];
  const filled = hasPreparationNote(note);

  function downloadNote() {
    if (!filled) return;
    const url = URL.createObjectURL(new Blob([formatPreparationNote(note, copy)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "legal-saathi-preparation.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("downloaded");
  }

  return (
    <section className={styles.note} aria-labelledby="preparation-note-title">
      <header>
        <span className={styles.number} aria-hidden="true">04 /</span>
        <h2 id="preparation-note-title">{copy.title}</h2>
        <p>{copy.intro}</p>
      </header>
      <p id="preparation-note-privacy" className={styles.privacy}>{copy.privacy}</p>
      <div className={styles.fields}>
        {(["timeline", "records", "question"] as const).map((key) => (
          <label key={key}>
            <span>{copy[key]}</span>
            <textarea value={note[key]} rows={key === "timeline" ? 4 : 3} maxLength={4000}
              aria-describedby="preparation-note-privacy"
              onChange={(event) => { setNote((current) => ({ ...current, [key]: event.target.value })); setStatus(null); }} />
          </label>
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={downloadNote} disabled={!filled}>{copy.download}</button>
        <button type="button" onClick={() => { setNote(EMPTY_PREPARATION_NOTE); setStatus("cleared"); }} disabled={!filled}>{copy.clear}</button>
      </div>
      <p className={styles.status} role="status">{status ? copy[status] : ""}</p>
    </section>
  );
}
