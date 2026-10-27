// Drawn profile avatars (#43): animals and fairy-tale characters, made for
// this app as small SVGs on a 100 x 100 grid. Each draws over the profile's
// own colour, so people still recognise theirs by colour.
window.Avatars = (() => {
    'use strict';

    const { html } = UI;
    const INK = '#1f1a17';
    const eyes = (y, gap = 10, r = 3.5) => html`<circle cx=${50 - gap} cy=${y} r=${r} fill=${INK} /><circle cx=${50 + gap} cy=${y} r=${r} fill=${INK} />`;
    const cheeks = (y, gap = 17) => html`<circle cx=${50 - gap} cy=${y} r="4.5" fill="#f28b9b" opacity=".6" /><circle cx=${50 + gap} cy=${y} r="4.5" fill="#f28b9b" opacity=".6" />`;
    const smile = (y) => html`<path d=${`M44 ${y} Q50 ${y + 6} 56 ${y}`} stroke=${INK} stroke-width="2.5" fill="none" stroke-linecap="round" />`;

    // Functions, so every avatar on screen gets its own nodes.
    const DRAWINGS = {
        fox: () => html`
            <path d="M22 22 L42 40 L26 50 Z" fill="#d9661f" /><path d="M78 22 L58 40 L74 50 Z" fill="#d9661f" />
            <path d="M20 44 Q50 28 80 44 Q78 70 50 84 Q22 70 20 44 Z" fill="#f28c38" />
            <path d="M24 52 Q40 58 50 84 Q30 74 24 52 Z" fill="#fff6ec" /><path d="M76 52 Q60 58 50 84 Q70 74 76 52 Z" fill="#fff6ec" />
            ${eyes(54)}<circle cx="50" cy="78" r="4" fill=${INK} />`,
        cat: () => html`
            <path d="M24 20 L42 38 L22 46 Z" fill="#8e98a3" /><path d="M76 20 L58 38 L78 46 Z" fill="#8e98a3" />
            <path d="M28 28 L37 37 L27 41 Z" fill="#f2a7b8" /><path d="M72 28 L63 37 L73 41 Z" fill="#f2a7b8" />
            <ellipse cx="50" cy="57" rx="30" ry="25" fill="#a3acb6" />
            <ellipse cx="40" cy="53" rx="4.5" ry="6" fill="#3bb273" /><ellipse cx="60" cy="53" rx="4.5" ry="6" fill="#3bb273" />
            <ellipse cx="40" cy="53" rx="1.6" ry="5" fill=${INK} /><ellipse cx="60" cy="53" rx="1.6" ry="5" fill=${INK} />
            <path d="M46 62 L54 62 L50 66 Z" fill="#e58aa8" />
            <path d="M22 62 L38 64 M22 70 L38 67 M78 62 L62 64 M78 70 L62 67" stroke="#4a5058" stroke-width="2" stroke-linecap="round" />`,
        panda: () => html`
            <circle cx="27" cy="30" r="11" fill="#222" /><circle cx="73" cy="30" r="11" fill="#222" />
            <ellipse cx="50" cy="56" rx="31" ry="27" fill="#fafafa" />
            <ellipse cx="38" cy="53" rx="7" ry="9.5" fill="#222" transform="rotate(-25 38 53)" /><ellipse cx="62" cy="53" rx="7" ry="9.5" fill="#222" transform="rotate(25 62 53)" />
            <circle cx="39" cy="52" r="2.6" fill="#fff" /><circle cx="61" cy="52" r="2.6" fill="#fff" />
            <ellipse cx="50" cy="65" rx="5" ry="3.5" fill="#222" />${smile(70)}`,
        owl: () => html`
            <path d="M22 38 L30 18 L42 30 L58 30 L70 18 L78 38 Q82 74 50 86 Q18 74 22 38 Z" fill="#8a5a3c" />
            <ellipse cx="50" cy="70" rx="17" ry="13" fill="#c99a70" />
            <circle cx="38" cy="46" r="12" fill="#fff" /><circle cx="62" cy="46" r="12" fill="#fff" />
            <circle cx="38" cy="46" r="5.5" fill=${INK} /><circle cx="62" cy="46" r="5.5" fill=${INK} />
            <path d="M45 56 L55 56 L50 64 Z" fill="#f2a33a" />`,
        lion: () => html`
            <circle cx="50" cy="52" r="37" fill="#c9772b" />
            <circle cx="31" cy="31" r="7" fill="#f2c35a" /><circle cx="69" cy="31" r="7" fill="#f2c35a" />
            <circle cx="50" cy="55" r="25" fill="#f2c35a" />
            ${eyes(51)}<path d="M45 61 L55 61 L50 67 Z" fill="#7a4a24" />${smile(70)}`,
        bear: () => html`
            <circle cx="27" cy="29" r="11" fill="#8b5e3c" /><circle cx="73" cy="29" r="11" fill="#8b5e3c" />
            <circle cx="27" cy="29" r="5.5" fill="#c49a6c" /><circle cx="73" cy="29" r="5.5" fill="#c49a6c" />
            <circle cx="50" cy="56" r="29" fill="#8b5e3c" />
            <ellipse cx="50" cy="66" rx="13" ry="10" fill="#c49a6c" />
            ${eyes(51)}<ellipse cx="50" cy="62" rx="5" ry="3.5" fill=${INK} />`,
        rabbit: () => html`
            <ellipse cx="39" cy="24" rx="8" ry="20" fill="#f4f1ee" /><ellipse cx="61" cy="24" rx="8" ry="20" fill="#f4f1ee" />
            <ellipse cx="39" cy="25" rx="3.5" ry="13" fill="#f2a7b8" /><ellipse cx="61" cy="25" rx="3.5" ry="13" fill="#f2a7b8" />
            <ellipse cx="50" cy="62" rx="26" ry="23" fill="#f4f1ee" />
            ${eyes(58)}${cheeks(66)}<path d="M47 65 L53 65 L50 68 Z" fill="#e58aa8" />`,
        frog: () => html`
            <circle cx="33" cy="38" r="13" fill="#4caf50" /><circle cx="67" cy="38" r="13" fill="#4caf50" />
            <ellipse cx="50" cy="62" rx="34" ry="23" fill="#4caf50" />
            <circle cx="33" cy="37" r="8.5" fill="#fff" /><circle cx="67" cy="37" r="8.5" fill="#fff" />
            <circle cx="33" cy="38" r="4.5" fill=${INK} /><circle cx="67" cy="38" r="4.5" fill=${INK} />
            ${cheeks(66, 22)}<path d="M36 66 Q50 76 64 66" stroke=${INK} stroke-width="2.5" fill="none" stroke-linecap="round" />`,
        unicorn: () => html`
            <path d="M24 40 Q20 70 34 82 Q28 60 38 44 Z" fill="#b48cf2" /><path d="M30 34 Q22 52 30 66 Q32 50 42 40 Z" fill="#f28bb8" />
            <circle cx="54" cy="58" r="26" fill="#fbf8ff" />
            <path d="M38 36 L44 26 L48 38 Z" fill="#fbf8ff" />
            <path d="M48 34 L56 8 L62 34 Z" fill="#f2c94c" /><path d="M51 26 L60 24 M53 18 L59 17" stroke="#d9a520" stroke-width="2" />
            <path d="M43 56 Q47 60 51 56 M59 56 Q63 60 67 56" stroke=${INK} stroke-width="2.5" fill="none" stroke-linecap="round" />
            <circle cx="40" cy="66" r="4.5" fill="#f28b9b" opacity=".6" /><circle cx="70" cy="66" r="4.5" fill="#f28b9b" opacity=".6" />
            ${smile(68)}`,
        dragon: () => html`
            <path d="M30 34 L28 14 L42 30 Z" fill="#f2c94c" /><path d="M70 34 L72 14 L58 30 Z" fill="#f2c94c" />
            <ellipse cx="50" cy="56" rx="30" ry="26" fill="#3fae7a" />
            <ellipse cx="50" cy="68" rx="18" ry="11" fill="#8fd9b0" />
            <circle cx="39" cy="50" r="6" fill="#f2e34c" /><circle cx="61" cy="50" r="6" fill="#f2e34c" />
            <ellipse cx="39" cy="50" rx="1.6" ry="5" fill=${INK} /><ellipse cx="61" cy="50" rx="1.6" ry="5" fill=${INK} />
            <circle cx="45" cy="66" r="2" fill="#24704c" /><circle cx="55" cy="66" r="2" fill="#24704c" />`,
        princess: () => html`
            <ellipse cx="50" cy="60" rx="31" ry="32" fill="#7a4a2a" />
            <circle cx="50" cy="60" r="22" fill="#f6c9a0" />
            <path d="M30 52 Q36 34 52 38 Q66 36 70 52 Q60 42 50 44 Q38 42 30 52 Z" fill="#7a4a2a" />
            <path d="M33 34 L36 18 L44 28 L50 14 L56 28 L64 18 L67 34 Z" fill="#f2c94c" />
            <circle cx="50" cy="24" r="2.5" fill="#e5487a" />
            ${eyes(59, 8, 3)}${cheeks(67, 13)}${smile(69)}`,
        wizard: () => html`
            <path d="M24 42 L56 6 L76 42 Z" fill="#5b4bb7" /><ellipse cx="50" cy="42" rx="30" ry="6" fill="#463a96" />
            <path d="M52 22 L54 27 L59 27 L55 30 L57 35 L52 32 L47 35 L49 30 L45 27 L50 27 Z" fill="#f2c94c" />
            <circle cx="50" cy="56" r="16" fill="#f6c9a0" />
            <path d="M32 58 Q50 98 68 58 Q60 66 50 64 Q40 66 32 58 Z" fill="#eeeeee" />
            ${eyes(53, 7, 3)}`,
    };

    const ids = Object.keys(DRAWINGS);

    return {
        ids,
        has: (id) => ids.indexOf(id) !== -1,
        svg: (id) => html`<svg viewBox="0 0 100 100" aria-hidden="true">${DRAWINGS[id]()}</svg>`,
    };
})();
