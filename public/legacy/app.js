// Small DOM helper: returns the first element matching a CSS selector.
var $ = function (s) { return document.querySelector(s); };
var lei = function (n) { return Math.round(n).toLocaleString("ro-RO") + " lei"; };
/* navigation */
// Show one app section and update the selected navigation tab.
function go(id) {
    document.querySelectorAll("section").forEach(function (s) { s.classList.toggle("on", s.id === id); });
    document.querySelectorAll("nav button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.go === id); });
    $("#main").scrollTop = 0;
}
document.addEventListener("click", function (e) { var g = e.target.closest("[data-go]"); if (g)
    go(g.dataset.go); });
/* loan maths */
// Calculate a fixed monthly payment, total repayment, and effective annual rate (DAE).
// L = principal, n = months, rate = nominal annual percentage, fee = upfront fee percentage.
function calc(L, n, rate, fee) {
    var r = rate / 1200, P = r ? L * r / (1 - Math.pow(1 + r, -n)) : L / n, up = L * fee / 100, net = L - up;
    var lo = 0, hi = 5;
    for (var k = 0; k < 80; k++) {
        var i = (lo + hi) / 2, pv = 0;
        for (var t = 1; t <= n; t++)
            pv += P / Math.pow(1 + i, t);
        if (pv > net)
            lo = i;
        else
            hi = i;
    }
    var m = (lo + hi) / 2;
    return { P: P, total: P * n + up, dae: (Math.pow(1 + m, 12) - 1) * 100 };
}
// Illustrative demo offers. Replace these with verified partner data in production.
var OFFERS = [
    { n: "Bancă A (demo)", t: "bank", r: 13.5, f: 1 },
    { n: "Bancă B (demo)", t: "bank", r: 15, f: 0.5 },
    { n: "Microfinanțare X (demo)", t: "omf", r: 48, f: 5 },
    { n: "Microfinanțare Y (demo)", t: "omf", r: 84, f: 8 }
];
var lastNew = 0;
// Recalculate and redraw all offers whenever the loan inputs change.
function renderOffers() {
    var L = +$("#amt").value, n = +$("#mon").value;
    $("#amtV").textContent = lei(L);
    $("#monV").textContent = n + " luni";
    var list = OFFERS.concat([{ n: "Oferta ta", t: "you", r: +$("#cr").value || 0, f: +$("#cf").value || 0 }]).map(function (o) {
        var c = calc(L, n, o.r, o.f);
        c.o = o;
        return c;
    });
    list.sort(function (a, b) { return a.dae - b.dae; });
    var max = Math.max.apply(null, list.map(function (x) { return x.total; }));
    var best = list[0], worst = list[list.length - 1];
    $("#msg").innerHTML = '<div class="alert bad">Cu cea mai scumpă ofertă plătești cu <b>' + lei(worst.total - best.total) + '</b> mai mult decât cu cea mai ieftină, pentru același împrumut.</div>';
    $("#offers").innerHTML = list.map(function (x, i) {
        var col = x.o.t === "bank" ? "var(--ok)" : x.o.t === "omf" ? "var(--bad)" : "var(--mute)";
        var tag = x.o.t === "bank" ? "bancă" : x.o.t === "omf" ? "microfinanțare" : "a ta";
        return '<div class="card offer"><div class="top"><div><h3>' + x.o.n + '</h3><span class="tag ' + x.o.t + '">' + tag + '</span>' + (i === 0 ? ' <span class="tag" style="background:var(--gold);color:#0E2747">cea mai ieftină</span>' : '') + '</div><div class="dae" style="color:' + col + '">' + x.dae.toFixed(1) + '%<span class="mute"> DAE</span></div></div>' +
            '<div class="bar"><i style="width:' + (x.total / max * 100) + '%;background:' + col + '"></i></div>' +
            '<div class="row"><span>Rată lunară</span><b>' + lei(x.P) + '</b></div>' +
            '<div class="row"><span>Total de plată</span><b>' + lei(x.total) + '</b></div>' +
            '<div class="row"><span>Cost în plus față de sumă</span><b>' + lei(x.total - L) + '</b></div>' +
            (x.dae > 50 ? '<p style="margin:8px 0 0;font-size:13px;color:var(--bad);font-weight:700">Atenție: cost foarte ridicat.</p>' : '') +
            '<button class="btn ghost" style="margin-top:8px;font-size:13px;padding:6px 12px" data-rate="' + Math.round(x.P) + '">Verifică dacă îmi permit rata</button></div>';
    }).join("");
}
["#amt", "#mon", "#cr", "#cf"].forEach(function (s) { $(s).addEventListener("input", renderOffers); });
$("#offers").addEventListener("click", function (e) {
    var b = e.target.closest("[data-rate]");
    if (!b)
        return;
    $("#nw").value = b.dataset.rate;
    renderDebt();
    go("debt");
});
/* debt */
// Update the debt-to-income indicator and the remaining monthly budget.
function renderDebt() {
    var inc = +$("#inc").value || 0, ex = +$("#ex").value || 0, nw = +$("#nw").value || 0;
    var pct = inc > 0 ? (ex + nw) / inc * 100 : 100;
    $("#ratio").textContent = pct.toFixed(0) + "%";
    $("#mark").style.left = "calc(" + Math.min(pct, 100) + "% - 3px)";
    var left = inc - ex - nw, cls, txt;
    if (pct <= 30) {
        cls = "ok";
        txt = "Rata încape în buget. Ai grijă totuși să păstrezi o rezervă pentru cheltuieli neprevăzute.";
    }
    else if (pct <= 40) {
        cls = "";
        txt = "Ești la limită. Orice scădere de venit te poate pune în dificultate: ia în calcul o sumă sau o perioadă diferită.";
    }
    else {
        cls = "bad";
        txt = "Prea mult. Nu îți recomandăm acest credit: există risc real de supraîndatorare. Încearcă o sumă mai mică sau o perioadă mai lungă.";
    }
    $("#verdict").innerHTML = '<div class="alert ' + cls + '">' + txt + '</div><div class="card"><div class="row"><span>Îți rămân după rate</span><b>' + lei(left) + ' / lună</b></div></div>';
}
["#inc", "#ex", "#nw"].forEach(function (s) { $(s).addEventListener("input", renderDebt); });
/* 4% a day */
// Demonstrate how an implausible daily return compounds over time.
function renderGrow() {
    var d = +$("#days").value, v = 1000 * Math.pow(1.04, d);
    $("#daysV").textContent = d + (d === 1 ? " zi" : " zile");
    $("#grow").textContent = v < 1e7 ? lei(v) : v.toExponential(2).replace("e+", " × 10^") + " lei";
    $("#growNote").textContent = d < 40 ? "Pare tentant. Dar nicio investiție reală nu face asta: banii „câștigați” vin din depunerile celor noi, până se prăbușește schema." : "Rezultat imposibil: ar depăși toți banii din lume. Dacă o ofertă promite asta, este o înșelătorie.";
}
$("#days").addEventListener("input", renderGrow);
/* quiz */
// Quiz statements and explanations. `s` is true when the statement is a scam.
var QS = [
    { t: "„Îți dublăm banii în 10 zile, garantat. Au mai rămas 3 locuri.”", s: true, w: "Câștig garantat + presiune de timp sunt semnele clasice ale unei scheme piramidale." },
    { t: "SMS de la „bancă”: „Contul tău este blocat. Apasă linkul și confirmă codul primit prin SMS.”", s: true, w: "Banca nu îți cere niciodată codul din SMS sau PIN-ul. Nu apăsa linkul; sună la numărul de pe card." },
    { t: "Plătești factura de apă din aplicația băncii tale, pe care ai deschis-o singur.", s: false, w: "Corect: ai inițiat tu plata, din aplicația oficială. Plata online este mai sigură decât pare." },
    { t: "Un „consultant” îți cere o taxă în avans ca să deblocheze un credit deja „aprobat”.", s: true, w: "Creditorii serioși nu cer bani înainte să îți dea banii." },
    { t: "Un prieten te îndeamnă să iei un credit de la o microfinanțare ca să investești într-o platformă necunoscută.", s: true, w: "Să te împrumuți scump pentru a investi riscant este rețeta supraîndatorării." }
];
var qi = 0, qs = 0;
// Render the current quiz question, feedback, or final score.
function renderQ() {
    var el = $("#quiz");
    if (qi >= QS.length) {
        el.innerHTML = '<h3>Rezultat</h3><div class="big" style="color:var(--ink)">' + qs + ' din ' + QS.length + '</div><p class="fb">' + (qs >= 4 ? "Foarte bine. Împărtășește testul cu cineva apropiat." : "Mai ai de exersat. Încearcă din nou și citește explicațiile.") + '</p><button class="btn" id="again">Reia testul</button>';
        $("#again").onclick = function () { qi = 0; qs = 0; renderQ(); };
        return;
    }
    var q = QS[qi];
    el.innerHTML = '<p class="mute" style="margin-bottom:0">Întrebarea ' + (qi + 1) + ' din ' + QS.length + '</p><div class="q">' + q.t + '</div><div class="opts"><button class="btn" data-a="1">Escrocherie</button><button class="btn ghost" data-a="0">Pare legitim</button></div><div class="fb" id="fb"></div>';
    el.querySelectorAll("[data-a]").forEach(function (b) {
        b.onclick = function () {
            var ok = (b.dataset.a === "1") === q.s;
            if (ok)
                qs++;
            el.querySelectorAll("[data-a]").forEach(function (x) { x.disabled = true; });
            $("#fb").innerHTML = '<div class="alert ' + (ok ? "ok" : "bad") + '"><b>' + (ok ? "Corect. " : "Nu chiar. ") + '</b>' + q.w + '</div><button class="btn" id="nx">' + (qi < QS.length - 1 ? "Următoarea" : "Vezi rezultatul") + '</button>';
            $("#nx").onclick = function () { qi++; renderQ(); };
        };
    });
}
/* Financial assistant: Ollama local API or an OpenAI-compatible API.
   Provider preferences are saved locally; API keys remain in memory only. */
var KB = [
    { k: ["dae", "efectiv"], a: "DAE este costul total al creditului pe an, cu tot cu comisioane. Două credite cu aceeași dobândă pot avea DAE diferit. Compară întotdeauna DAE, nu doar dobânda." },
    { k: ["dobând", "dobanda", "dobinda"], a: "Dobânda este prețul banilor împrumutați. La 10 000 lei cu 20% pe an, plătești aproximativ 2 000 lei în plus pe an. Întreabă mereu care este DAE, nu doar dobânda nominală." },
    { k: ["inflați", "inflati"], a: "Inflația înseamnă că prețurile cresc, deci aceiași bani cumpără mai puțin. Dacă economiile tale cresc mai încet decât prețurile, de fapt pierzi putere de cumpărare." },
    { k: ["microfin", "omf", "rapid", "sms"], a: "Microfinanțările dau bani repede, dar pot costa mult mai mult. Compară DAE și costul total înainte de a semna." },
    { k: ["garan", "gaj", "fermier", "agricult"], a: "Garanția (gajul) este un bun pe care creditorul îl poate valorifica dacă nu plătești. Citește atent contractul și cere explicații despre riscuri înainte de a semna." },
    { k: ["fraud", "escroc", "înșel", "insel", "piramid", "4%"], a: "Semne de alarmă: câștig garantat, presiune de timp, cereri de coduri sau parole și taxe în avans. Nu trimite bani sau date sensibile unor persoane neverificate." },
    { k: ["card", "online", "plat"], a: "Folosește doar aplicații și site-uri oficiale. Nu da nimănui PIN-ul sau codul primit prin SMS; verifică destinatarul înainte de a confirma plata." },
    { k: ["transfer", "diaspora", "remit"], a: "La transferuri compară atât comisionul, cât și cursul de schimb. Verifică suma care ajunge efectiv la destinatar." }
];

var DEFAULT_SYSTEM_PROMPT = "Ești asistentul educațional Finconsult. Răspunde în limba română, clar, prietenos și pe înțelesul publicului larg. Explică noțiuni financiare generale, riscuri de creditare și prevenirea fraudelor. Nu pretinde că ești consultant financiar, nu garanta rezultate și nu recomanda produse financiare specifice. Pentru decizii importante, încurajează utilizatorul să citească contractul și să discute cu un specialist. Dacă nu știi un fapt local sau actual, spune că nu îl poți verifica. Nu cere PIN-uri, parole, coduri SMS sau date bancare. Nu inventa dobânzi, comisioane, statistici, instituții sau reguli legale. Când lipsesc datele necesare, cere clarificări.";

var aiConfig = {
    provider: "ollama",
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "llama3.2",
    apiBaseUrl: "https://api.openai.com/v1",
    apiModel: "gpt-4o-mini",
    geminiModel: "gemini-2.5-flash-lite",
    systemPrompt: DEFAULT_SYSTEM_PROMPT
};
var apiKeyInMemory = "";
var geminiKeyInMemory = "";
var chatHistory = [];
var isAssistantBusy = false;

function say(t, me, extraClass) {
    var d = document.createElement("div");
    d.className = "m " + (me ? "me" : "bot") + (extraClass ? " " + extraClass : "");
    d.textContent = t;
    $("#chat").appendChild(d);
    $("#main").scrollTop = $("#main").scrollHeight;
    return d;
}

function setAssistantStatus(message) {
    $("#assistantMode").textContent = message;
}

function setSettingsStatus(message) {
    $("#settingsStatus").textContent = message;
}

// Persist model preferences and the system prompt, but never API secrets.
function loadAISettings() {
    try {
        var saved = JSON.parse(localStorage.getItem("finconsult-ai-settings") || "{}");
        aiConfig.provider = ["ollama", "openai", "gemini"].includes(saved.provider)
            ? saved.provider : "ollama";
        aiConfig.ollamaUrl = saved.ollamaUrl || aiConfig.ollamaUrl;
        aiConfig.ollamaModel = saved.ollamaModel || aiConfig.ollamaModel;
        aiConfig.apiBaseUrl = saved.apiBaseUrl || aiConfig.apiBaseUrl;
        aiConfig.apiModel = saved.apiModel || aiConfig.apiModel;
        aiConfig.geminiModel = saved.geminiModel || aiConfig.geminiModel;
        aiConfig.systemPrompt = typeof saved.systemPrompt === "string"
            ? saved.systemPrompt : DEFAULT_SYSTEM_PROMPT;
    } catch (error) {
        console.warn("Nu am putut încărca setările AI:", error);
    }

    $("#aiProvider").value = aiConfig.provider;
    $("#ollamaUrl").value = aiConfig.ollamaUrl;
    $("#ollamaModel").value = aiConfig.ollamaModel;
    $("#apiBaseUrl").value = aiConfig.apiBaseUrl;
    $("#apiModel").value = aiConfig.apiModel;
    $("#geminiModel").value = aiConfig.geminiModel;
    $("#systemPrompt").value = aiConfig.systemPrompt;
    updateProviderFields();
    updateAssistantMode();
}

function updateProviderFields() {
    var provider = $("#aiProvider").value;
    $("#ollamaSettings").hidden = provider !== "ollama";
    $("#openaiSettings").hidden = provider !== "openai";
    $("#geminiSettings").hidden = provider !== "gemini";
}

function readSettingsForm() {
    aiConfig.provider = $("#aiProvider").value;
    aiConfig.ollamaUrl = $("#ollamaUrl").value.trim().replace(/\/+$/, "");
    aiConfig.ollamaModel = $("#ollamaModel").value.trim();
    aiConfig.apiBaseUrl = $("#apiBaseUrl").value.trim().replace(/\/+$/, "");
    aiConfig.apiModel = $("#apiModel").value.trim();
    aiConfig.geminiModel = $("#geminiModel").value.trim();
    aiConfig.systemPrompt = $("#systemPrompt").value.trim() || DEFAULT_SYSTEM_PROMPT;

    if ($("#apiKey").value.trim()) {
        apiKeyInMemory = $("#apiKey").value.trim();
    }
    if ($("#geminiKey").value.trim()) {
        geminiKeyInMemory = $("#geminiKey").value.trim();
    }
}

function updateAssistantMode() {
    if (aiConfig.provider === "ollama") {
        setAssistantStatus("Mod AI: Ollama local · " + aiConfig.ollamaModel);
    } else if (aiConfig.provider === "gemini") {
        setAssistantStatus("Mod AI: Google Gemini · " + aiConfig.geminiModel +
            (geminiKeyInMemory ? " · cheie disponibilă în sesiune" : " · adaugă cheia în Setări"));
    } else {
        setAssistantStatus("Mod AI: API compatibil · " + aiConfig.apiModel +
            (apiKeyInMemory ? " · cheie disponibilă în sesiune" : " · adaugă cheia în Setări"));
    }
}

function openSettings() {
    $("#settingsBackdrop").hidden = false;
    $("#settingsStatus").textContent = "";
    $("#closeSettings").focus();
}

function closeSettings() {
    $("#settingsBackdrop").hidden = true;
    $("#openSettings").focus();
}

$("#openSettings").addEventListener("click", openSettings);
$("#closeSettings").addEventListener("click", closeSettings);
$("#settingsBackdrop").addEventListener("click", function (event) {
    if (event.target === $("#settingsBackdrop")) closeSettings();
});
document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !$("#settingsBackdrop").hidden) closeSettings();
});
$("#aiProvider").addEventListener("change", updateProviderFields);

$("#clearApiKey").addEventListener("click", function () {
    apiKeyInMemory = "";
    $("#apiKey").value = "";
    updateAssistantMode();
    setSettingsStatus("Cheia API compatibilă a fost ștearsă din sesiune.");
});
$("#clearGeminiKey").addEventListener("click", function () {
    geminiKeyInMemory = "";
    $("#geminiKey").value = "";
    updateAssistantMode();
    setSettingsStatus("Cheia Gemini a fost ștearsă din sesiune.");
});
$("#resetPrompt").addEventListener("click", function () {
    $("#systemPrompt").value = DEFAULT_SYSTEM_PROMPT;
    aiConfig.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    setSettingsStatus("Instrucțiunile implicite au fost restaurate. Apasă Salvează setările pentru a le păstra.");
});

$("#saveSettings").addEventListener("click", function () {
    readSettingsForm();

    if (aiConfig.provider === "ollama" && (!aiConfig.ollamaUrl || !aiConfig.ollamaModel)) {
        setSettingsStatus("Completează adresa serverului și numele modelului.");
        return;
    }
    if (aiConfig.provider === "openai" && (!aiConfig.apiBaseUrl || !aiConfig.apiModel)) {
        setSettingsStatus("Completează URL-ul API și numele modelului.");
        return;
    }
    if (aiConfig.provider === "gemini" && !aiConfig.geminiModel) {
        setSettingsStatus("Completează numele modelului Gemini.");
        return;
    }

    try {
        localStorage.setItem("finconsult-ai-settings", JSON.stringify({
            provider: aiConfig.provider,
            ollamaUrl: aiConfig.ollamaUrl,
            ollamaModel: aiConfig.ollamaModel,
            apiBaseUrl: aiConfig.apiBaseUrl,
            apiModel: aiConfig.apiModel,
            geminiModel: aiConfig.geminiModel,
            systemPrompt: aiConfig.systemPrompt
        }));
    } catch (error) {
        console.warn("Setările nu au putut fi salvate:", error);
    }

    updateAssistantMode();
    setSettingsStatus("Setările și instrucțiunile au fost salvate. Cheile API rămân doar în memoria acestei pagini.");
});

function findPreparedAnswer(question) {
    var normalized = question.toLowerCase();
    for (var i = 0; i < KB.length; i++) {
        if (KB[i].k.some(function (word) { return normalized.indexOf(word) !== -1; })) {
            return KB[i].a;
        }
    }
    return "Nu sunt sigur că am înțeles. Încearcă un termen precum dobândă, DAE, inflație, garanție sau fraudă. Poți consulta și un specialist.";
}

function buildMessages(question) {
    var recentHistory = chatHistory.slice(-12);
    return recentHistory.concat([{ role: "user", content: question }]);
}

// Ollama accepts a system message as the first item in messages.
async function requestOllama(messages) {
    var response = await fetch(aiConfig.ollamaUrl + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: aiConfig.ollamaModel,
            messages: [{ role: "system", content: aiConfig.systemPrompt }].concat(messages),
            stream: false,
            options: { temperature: 0.4 }
        })
    });

    if (!response.ok) {
        throw new Error("Ollama a răspuns cu HTTP " + response.status + ". Verifică modelul și serverul.");
    }

    var data = await response.json();
    if (!data.message || !data.message.content) {
        throw new Error("Ollama a returnat un răspuns gol.");
    }
    return data.message.content.trim();
}

// OpenAI-compatible providers accept the system prompt as a system message.
async function requestOpenAICompatible(messages) {
    if (!apiKeyInMemory) {
        throw new Error("Lipsește cheia API. Deschide Setări și introdu cheia furnizorului.");
    }

    var baseUrl = aiConfig.apiBaseUrl.replace(/\/+$/, "");
    var endpoint = baseUrl.endsWith("/chat/completions")
        ? baseUrl
        : baseUrl + "/chat/completions";

    var response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKeyInMemory
        },
        body: JSON.stringify({
            model: aiConfig.apiModel,
            messages: [{ role: "system", content: aiConfig.systemPrompt }].concat(messages),
            temperature: 0.4
        })
    });

    if (!response.ok) {
        var errorText = await response.text();
        throw new Error("API-ul a răspuns cu HTTP " + response.status +
            (errorText ? ": " + errorText.slice(0, 220) : ""));
    }

    var data = await response.json();
    var content = data.choices && data.choices[0] &&
        data.choices[0].message && data.choices[0].message.content;

    if (typeof content !== "string" || !content.trim()) {
        throw new Error("API-ul nu a returnat un răspuns text compatibil.");
    }
    return content.trim();
}

// Gemini's native REST API uses systemInstruction and role-based contents.
async function requestGemini(messages) {
    if (!geminiKeyInMemory) {
        throw new Error("Lipsește cheia Gemini API. Deschide Setări și introdu cheia Google AI Studio.");
    }

    var contents = messages.map(function (message) {
        return {
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }]
        };
    });

    var endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(aiConfig.geminiModel) + ":generateContent?key=" +
        encodeURIComponent(geminiKeyInMemory);

    var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: aiConfig.systemPrompt }]
            },
            contents: contents,
            generationConfig: { temperature: 0.4 }
        })
    });

    if (!response.ok) {
        var errorText = await response.text();
        throw new Error("Gemini a răspuns cu HTTP " + response.status +
            (errorText ? ": " + errorText.slice(0, 240) : ""));
    }

    var data = await response.json();
    var parts = data.candidates && data.candidates[0] &&
        data.candidates[0].content && data.candidates[0].content.parts;
    var content = parts ? parts.map(function (part) { return part.text || ""; }).join("") : "";

    if (!content.trim()) {
        var reason = data.candidates && data.candidates[0] && data.candidates[0].finishReason;
        throw new Error("Gemini nu a returnat text. Motiv: " + (reason || "răspuns gol"));
    }
    return content.trim();
}

async function requestAssistant(question) {
    var messages = buildMessages(question);
    if (aiConfig.provider === "ollama") return await requestOllama(messages);
    if (aiConfig.provider === "gemini") return await requestGemini(messages);
    return await requestOpenAICompatible(messages);
}

async function testAIConnection() {
    readSettingsForm();
    setSettingsStatus("Se testează conexiunea…");
    $("#testAI").disabled = true;

    try {
        if (aiConfig.provider === "ollama") {
            var response = await fetch(aiConfig.ollamaUrl + "/api/tags");
            if (!response.ok) throw new Error("Serverul Ollama a răspuns cu HTTP " + response.status + ".");
            var data = await response.json();
            var models = (data.models || []).map(function (model) { return model.name; });
            var found = models.some(function (name) {
                return name === aiConfig.ollamaModel ||
                    name.indexOf(aiConfig.ollamaModel + ":") === 0;
            });
            if (!found) {
                throw new Error("Serverul funcționează, dar modelul „" + aiConfig.ollamaModel +
                    "” nu apare în lista locală. Verifică numele sau descarcă modelul.");
            }
            setSettingsStatus("Conexiune reușită. Model găsit: " + aiConfig.ollamaModel);
        } else if (aiConfig.provider === "gemini") {
            if (!geminiKeyInMemory) {
                throw new Error("Introdu cheia Gemini API înainte de testare.");
            }
            var testResult = await requestGemini([{ role: "user", content: "Răspunde doar cu: Conexiune reușită." }]);
            setSettingsStatus("Conexiune Gemini reușită. Modelul " + aiConfig.geminiModel + " a generat un răspuns.");
        } else {
            if (!apiKeyInMemory) throw new Error("Introdu cheia API înainte de testare.");

            var baseUrl = aiConfig.apiBaseUrl.replace(/\/+$/, "");
            var endpoint = baseUrl.endsWith("/chat/completions")
                ? baseUrl : baseUrl + "/chat/completions";
            var apiResponse = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + apiKeyInMemory
                },
                body: JSON.stringify({
                    model: aiConfig.apiModel,
                    messages: [{ role: "system", content: aiConfig.systemPrompt },
                        { role: "user", content: "Răspunde doar cu: Conexiune reușită." }],
                    max_tokens: 20
                })
            });
            if (!apiResponse.ok) {
                var apiError = await apiResponse.text();
                throw new Error("Testul API a eșuat (HTTP " + apiResponse.status + "). " +
                    apiError.slice(0, 180));
            }
            setSettingsStatus("Conexiune API reușită. Modelul " + aiConfig.apiModel + " a răspuns.");
        }
        updateAssistantMode();
    } catch (error) {
        setSettingsStatus("Eroare: " + error.message +
            (aiConfig.provider === "ollama"
                ? " Verifică dacă Ollama rulează și setarea OLLAMA_ORIGINS."
                : " Verifică cheia, modelul și permisiunea CORS."));
    } finally {
        $("#testAI").disabled = false;
    }
}
$("#testAI").addEventListener("click", testAIConnection);

async function answer(question) {
    if (isAssistantBusy) return;

    say(question, true);
    $("#ask").value = "";
    isAssistantBusy = true;
    var sendButton = $("#sendf button[type='submit']");
    sendButton.disabled = true;
    sendButton.textContent = "Se generează…";
    var pending = say("Generez răspunsul…", false, "pending");

    try {
        var response = await requestAssistant(question);
        pending.remove();
        say(response, false);
        chatHistory.push({ role: "user", content: question });
        chatHistory.push({ role: "assistant", content: response });
    } catch (error) {
        pending.remove();
        var message = "Nu am putut contacta asistentul AI. " + error.message;
        if (aiConfig.provider === "ollama") {
            message += " Verifică dacă Ollama rulează, modelul este instalat și pagina are permisiune să acceseze serverul local.";
        } else {
            message += " Verifică setările furnizorului și permisiunea CORS.";
        }
        say(message, false);
        console.error("Eroare asistent AI:", error);
    } finally {
        isAssistantBusy = false;
        sendButton.disabled = false;
        sendButton.textContent = "Trimite";
    }
}

$("#sendf").addEventListener("submit", function (event) {
    event.preventDefault();
    var question = $("#ask").value.trim();
    if (question) answer(question);
});

["Ce este DAE?", "Ce este inflația?", "Sunt sigure plățile online?", "Cum recunosc o escrocherie?"].forEach(function (text) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.onclick = function () { answer(text); };
    $("#chips").appendChild(button);
});

loadAISettings();
say("Bună! Sunt asistentul Finconsult. Configurează un model AI din Setări, apoi întreabă-mă despre credite, dobânzi sau siguranța banilor.");
$("#human").onclick = function () { say("Cererea ta a fost trimisă (simulare). Un consultant financiar te va contacta în câteva minute."); };
say("Bună! Sunt asistentul Finconsult. Întreabă-mă orice despre credite, dobânzi sau siguranța banilor.");
// Load the prototype's initial calculated values.
renderOffers();
renderDebt();
renderGrow();
renderQ();
