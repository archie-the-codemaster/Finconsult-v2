import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import AuthPanel from "./components/AuthPanel";
import { fetchMe, type Profile } from "./lib/api";

type Page = "home" | "calc" | "debt" | "fraud" | "bot";
type Theme = "light" | "dark";

const navItems: { id: Page; label: string; icon: string }[] = [
  { id: "home", label: "Acasă", icon: "fa-house" },
  { id: "calc", label: "Credite", icon: "fa-calculator" },
  { id: "debt", label: "Rata", icon: "fa-gauge-high" },
  { id: "fraud", label: "Anti-fraudă", icon: "fa-shield-halved" },
  { id: "bot", label: "Asistent", icon: "fa-comments" },
];

const money = (value: number) =>
  `${Math.round(value).toLocaleString("ro-RO")} lei`;

function Icon({ name }: { name: string }) {
  return <i className={`fa-solid ${name}`} aria-hidden="true" />;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [page, setPage] = useState<Page>("home");
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("finconsult-theme") as Theme) || "light"
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [monthlyPayment, setMonthlyPayment] = useState(900);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileRefresh, setProfileRefresh] = useState(0);

  useEffect(() => {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
  });

  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
  });

  useEffect(() => {
  if (!session) {
    setProfile(null);
    setProfileError("");
    setProfileLoading(false);
    return;
  }

  const controller = new AbortController();

  const loadProfile = async () => {
    setProfileLoading(true);
    setProfile(null);
    setProfileError("");

    try {
      const result = await fetchMe(
        session.access_token,
        controller.signal,
      );

      setProfile(result.profile);

      if (result.profile_status === "missing") {
        setProfileError(
          "Profilul nu a fost găsit. Încearcă să reîncarci datele.",
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;

      setProfile(null);
      setProfileError(
        error instanceof Error
          ? error.message
          : "Nu s-a putut încărca profilul.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setProfileLoading(false);
      }
    }
  };

  loadProfile();

  return () => controller.abort();
  }, [session?.access_token, profileRefresh]);

  return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("finconsult-theme", theme);
  }, [theme]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const navigate = (nextPage: Page) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="site-shell">
      <header className="brand-ribbon">
        <div className="brand">
          <span className="brand-symbol">
            <Icon name="fa-leaf" />
          </span>
          <span className="brand-name">Finconsult</span>
          <span className="brand-tag">EDUCAȚIE FINANCIARĂ</span>
        </div>

        <div className="brand-actions">
            <span className="ribbon-note">
              <Icon name="fa-wand-magic-sparkles" />
              Claritate pentru decizii mai bune
            </span>

            <button
              className="button button-secondary account-button"
              onClick={() => setAuthOpen(true)}
            >
            {session ? "Contul meu" : "Autentificare"}
            </button>
            
            <button
              className="icon-button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Deschide setările"
              title="Setări"
            >
              <Icon name="fa-gear" />
            </button>
            
            <button
              className="icon-button theme-toggle"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={theme === "light" ? "Activează tema întunecată" : "Activează tema luminoasă"}
              title="Schimbă tema"
            >
              <Icon name={theme === "light" ? "fa-moon" : "fa-sun"} />
            </button>
        </div>
      </header>

      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-label">MENIU</div>

          <nav aria-label="Navigare principală">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-link ${page === item.id ? "active" : ""}`}
                onClick={() => navigate(item.id)}
                aria-current={page === item.id ? "page" : undefined}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-bottom">
            <button
              className="nav-link"
              onClick={() => setSettingsOpen(true)}
            >
              <Icon name="fa-gear" />
              <span>Setări</span>
            </button>
          </div>
        </aside>

        <main className="main-content">
          {page === "home" && <HomePage onNavigate={navigate} />}

          {page === "calc" && (
            <LoanCalculator onChoosePayment={setMonthlyPayment} onNavigate={navigate} />
          )}

          {page === "debt" && (
            <DebtCalculator suggestedPayment={monthlyPayment} />
          )}

          {page === "fraud" && <FraudPage />}

          {page === "bot" && <AssistantMigrationNotice onOpenSettings={() => setSettingsOpen(true)} />}
        </main>
      </div>

      <footer className="site-footer">
        Finconsult · Prototip educațional · Datele și ofertele sunt demonstrative
      </footer>
      
      {authOpen && (
        <AuthPanel
          session={session}
          profile={profile}
          profileLoading={profileLoading}
          profileError={profileError}
          onClose={() => setAuthOpen(false)}
          onRefreshProfile={() => setProfileRefresh((value) => value + 1)}
        />
      )} 

      {settingsOpen && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

function HomePage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const tiles: { page: Page; title: string; description: string; icon: string }[] = [
    { page: "calc", title: "Cost real al creditului", description: "Bancă sau microfinanțare? Compară DAE.", icon: "fa-scale-balanced" },
    { page: "debt", title: "Îmi permit rata?", description: "Calculează gradul de îndatorare.", icon: "fa-chart-pie" },
    { page: "fraud", title: "Test anti-fraudă", description: "Învață să recunoști capcanele online.", icon: "fa-shield-halved" },
    { page: "bot", title: "Asistent financiar", description: "Întrebări despre bani și credite.", icon: "fa-comments" },
  ];

  return (
    <section className="page">
      <div className="eyebrow">DECIZII FINANCIARE MAI BUNE</div>
      <h1>Înainte să semnezi, vezi cât costă cu adevărat.</h1>
      <p className="page-intro">
        Compară credite, verifică dacă îți permiți rata și învață să
        recunoști o escrocherie. Fără jargon.
      </p>

      <div className="feature-grid">
        {tiles.map((tile) => (
          <button
            className="feature-card"
            key={tile.page}
            onClick={() => onNavigate(tile.page)}
          >
            <span className="feature-icon"><Icon name={tile.icon} /></span>
            <strong>{tile.title}</strong>
            <span>{tile.description}</span>
            <span className="feature-arrow"><Icon name="fa-arrow-right" /></span>
          </button>
        ))}
      </div>

      <h2>De ce contează</h2>
      <div className="facts-grid">
        <div className="surface-card">Dobânda și inflația influențează fiecare decizie financiară.</div>
        <div className="surface-card">Fraudele online folosesc adesea presiunea și promisiunile nerealiste.</div>
        <div className="surface-card">Compararea costului total te ajută să eviți creditele prea scumpe.</div>
      </div>
    </section>
  );
}

/* The annual percentage rate is approximated from the monthly repayment
   and the amount actually received after the upfront fee. */
function calculateLoan(
  principal: number,
  months: number,
  annualRate: number,
  feePercent: number
) {
  const monthlyRate = annualRate / 1200;
  const payment = monthlyRate
    ? principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months))
    : principal / months;

  const fee = principal * feePercent / 100;
  const netAmount = principal - fee;

  let low = 0;
  let high = 5;

  for (let i = 0; i < 80; i++) {
    const rate = (low + high) / 2;
    let presentValue = 0;

    for (let month = 1; month <= months; month++) {
      presentValue += payment / Math.pow(1 + rate, month);
    }

    if (presentValue > netAmount) low = rate;
    else high = rate;
  }

  const monthlyEffectiveRate = (low + high) / 2;

  return {
    payment,
    total: payment * months + fee,
    dae: (Math.pow(1 + monthlyEffectiveRate, 12) - 1) * 100,
  };
}

const demoOffers = [
  { name: "Bancă A (demo)", type: "bank", rate: 13.5, fee: 1 },
  { name: "Bancă B (demo)", type: "bank", rate: 15, fee: 0.5 },
  { name: "Microfinanțare X (demo)", type: "omf", rate: 48, fee: 5 },
  { name: "Microfinanțare Y (demo)", type: "omf", rate: 84, fee: 8 },
];

function LoanCalculator({
  onChoosePayment,
  onNavigate,
}: {
  onChoosePayment: (payment: number) => void;
  onNavigate: (page: Page) => void;
}) {
  const [amount, setAmount] = useState(10000);
  const [months, setMonths] = useState(12);
  const [rate, setRate] = useState(30);
  const [fee, setFee] = useState(3);

  const offers = [
    ...demoOffers,
    { name: "Oferta ta", type: "you", rate, fee },
  ]
    .map((offer) => ({
      ...offer,
      ...calculateLoan(amount, months, offer.rate, offer.fee),
    }))
    .sort((a, b) => a.dae - b.dae);

  const best = offers[0];
  const worst = offers[offers.length - 1];
  const maxTotal = Math.max(...offers.map((offer) => offer.total));

  return (
    <section className="page">
      <div className="eyebrow">CALCULATOR DE CREDIT</div>
      <h1>Costul real al creditului</h1>
      <p className="page-intro">
        Compară ofertele folosind DAE — indicatorul care include dobânda
        și comisioanele.
      </p>

      <div className="surface-card form-card">
        <label>
          Suma împrumutată <strong>{money(amount)}</strong>
          <input type="range" min="1000" max="100000" step="500"
            value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </label>

        <label>
          Perioada <strong>{months} luni</strong>
          <input type="range" min="3" max="60"
            value={months} onChange={(e) => setMonths(Number(e.target.value))} />
        </label>

        <div className="form-grid">
          <label>
            Dobândă nominală (% / an)
            <input type="number" min="0" max="500" value={rate}
              onChange={(e) => setRate(Number(e.target.value))} />
          </label>
          <label>
            Comision (%)
            <input type="number" min="0" max="30" value={fee}
              onChange={(e) => setFee(Number(e.target.value))} />
          </label>
        </div>
      </div>

      <div className="notice notice-warning">
        Diferența dintre cea mai scumpă și cea mai ieftină ofertă este
        <strong> {money(worst.total - best.total)}</strong>.
      </div>

      <div className="offer-list">
        {offers.map((offer, index) => (
          <article className="surface-card offer-card" key={offer.name}>
            <div className="offer-heading">
              <div>
                <h3>{offer.name}</h3>
                <span className={`offer-tag ${offer.type}`}>
                  {offer.type === "bank" ? "bancă" : offer.type === "omf" ? "microfinanțare" : "oferta ta"}
                </span>
                {index === 0 && <span className="offer-tag best">cea mai ieftină</span>}
              </div>
              <strong className="offer-dae">{offer.dae.toFixed(1)}% <small>DAE</small></strong>
            </div>

            <div className="offer-bar">
              <span style={{ width: `${offer.total / maxTotal * 100}%` }} />
            </div>

            <div className="stat-row"><span>Rată lunară</span><strong>{money(offer.payment)}</strong></div>
            <div className="stat-row"><span>Total de plată</span><strong>{money(offer.total)}</strong></div>
            <div className="stat-row"><span>Cost în plus</span><strong>{money(offer.total - amount)}</strong></div>

            {offer.dae > 50 && (
              <p className="warning-text">Atenție: cost foarte ridicat.</p>
            )}

            <button className="button button-secondary"
              onClick={() => {
                onChoosePayment(Math.round(offer.payment));
                onNavigate("debt");
              }}>
              Verifică dacă îmi permit rata
            </button>
          </article>
        ))}
      </div>

      <p className="muted-note">
        Ofertele sunt strict demonstrative și nu reprezintă tarife reale.
      </p>
    </section>
  );
}

function DebtCalculator({ suggestedPayment }: { suggestedPayment: number }) {
  const [income, setIncome] = useState(9000);
  const [existing, setExisting] = useState(800);
  const [newPayment, setNewPayment] = useState(suggestedPayment);

  useEffect(() => setNewPayment(suggestedPayment), [suggestedPayment]);

  const ratio = income > 0 ? (existing + newPayment) / income * 100 : 100;
  const remaining = income - existing - newPayment;

  const verdict = ratio <= 30
    ? { className: "notice-success", text: "Rata pare să încapă în buget. Păstrează totuși o rezervă pentru cheltuieli neprevăzute." }
    : ratio <= 40
      ? { className: "notice-warning", text: "Ești la limită. O scădere a venitului te-ar putea pune în dificultate." }
      : { className: "notice-danger", text: "Gradul de îndatorare este ridicat. Ia în calcul o sumă mai mică sau o perioadă mai lungă." };

  return (
    <section className="page">
      <div className="eyebrow">BUGETUL TĂU</div>
      <h1>Îți permiți rata?</h1>
      <p className="page-intro">
        Un reper orientativ este ca toate ratele lunare să rămână în jurul
        a 30–40% din venitul net.
      </p>

      <div className="surface-card form-card">
        <label>Venit lunar net (lei)
          <input type="number" min="0" value={income}
            onChange={(e) => setIncome(Number(e.target.value))} />
        </label>
        <label>Rate existente (lei / lună)
          <input type="number" min="0" value={existing}
            onChange={(e) => setExisting(Number(e.target.value))} />
        </label>
        <label>Rata nouă (lei / lună)
          <input type="number" min="0" value={newPayment}
            onChange={(e) => setNewPayment(Number(e.target.value))} />
        </label>
      </div>

      <div className="surface-card gauge-card">
        <div className="stat-row">
          <h2>Grad de îndatorare</h2>
          <strong className="gauge-value">{ratio.toFixed(0)}%</strong>
        </div>
        <div className="gauge-track">
          <span style={{ width: `${Math.min(ratio, 100)}%` }} />
        </div>
        <div className="gauge-labels"><span>0%</span><span>30%</span><span>40%</span><span>100%</span></div>
      </div>

      <div className={`notice ${verdict.className}`}>{verdict.text}</div>

      <div className="surface-card remaining-card">
        <span>Îți rămân după rate</span>
        <strong>{money(remaining)} / lună</strong>
      </div>
    </section>
  );
}

const quizQuestions = [
  {
    text: "„Îți dublăm banii în 10 zile, garantat. Au mai rămas 3 locuri.”",
    scam: true,
    explanation: "Câștigul garantat și presiunea de timp sunt semne clasice ale unei scheme frauduloase.",
  },
  {
    text: "SMS de la „bancă”: „Contul tău este blocat. Apasă linkul și confirmă codul primit prin SMS.”",
    scam: true,
    explanation: "Nu transmite niciodată coduri SMS sau PIN-uri prin linkuri primite în mesaje.",
  },
  {
    text: "Plătești factura de apă din aplicația oficială a băncii, pe care ai deschis-o singur.",
    scam: false,
    explanation: "Ai inițiat plata din aplicația oficială. Verifică totuși mereu beneficiarul și suma.",
  },
  {
    text: "Un consultant îți cere o taxă în avans pentru a debloca un credit deja aprobat.",
    scam: true,
    explanation: "O taxă urgentă pentru un credit „deja aprobat” este un semnal de alarmă.",
  },
  {
    text: "Un prieten te îndeamnă să iei un credit pentru a investi într-o platformă necunoscută.",
    scam: true,
    explanation: "Să te împrumuți pentru o investiție riscantă poate duce la supraîndatorare.",
  },
];

function FraudPage() {
  const [days, setDays] = useState(30);
  const [question, setQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [answer, setAnswer] = useState<boolean | null>(null);

  const growth = 1000 * Math.pow(1.04, days);
  const current = quizQuestions[question];

  const growthText = growth < 1e7
    ? money(growth)
    : `${growth.toExponential(2).replace("e+", " × 10^")} lei`;

  const chooseAnswer = (choice: boolean) => {
    if (answer !== null) return;
    setAnswer(choice);
    if (choice === current.scam) setScore((value) => value + 1);
  };

  const nextQuestion = () => {
    setQuestion((value) => value + 1);
    setAnswer(null);
  };

  const restart = () => {
    setQuestion(0);
    setScore(0);
    setAnswer(null);
  };

  return (
    <section className="page">
      <div className="eyebrow">SIGURANȚĂ DIGITALĂ</div>
      <h1>Test anti-fraudă</h1>

      <div className="surface-card form-card">
        <h2>Ce înseamnă „4% pe zi”?</h2>
        <label>
          După {days} {days === 1 ? "zi" : "zile"}
          <input type="range" min="1" max="365" value={days}
            onChange={(e) => setDays(Number(e.target.value))} />
        </label>
        <p className="muted-note">1 000 lei ar deveni:</p>
        <strong className="growth-number">{growthText}</strong>
        <p className="muted-note">
          O promisiune de câștig fix și foarte mare în fiecare zi este un
          semnal major de alarmă.
        </p>
      </div>

      <div className="surface-card quiz-card">
        {question >= quizQuestions.length ? (
          <>
            <div className="eyebrow">REZULTAT</div>
            <h2>{score} din {quizQuestions.length}</h2>
            <p>{score >= 4
              ? "Foarte bine! Ai identificat majoritatea semnalelor de alarmă."
              : "Mai ai de exersat. Recitește explicațiile și încearcă din nou."}</p>
            <button className="button" onClick={restart}>Reia testul</button>
          </>
        ) : (
          <>
            <div className="eyebrow">ÎNTREBAREA {question + 1} / {quizQuestions.length}</div>
            <h2>{current.text}</h2>
            <div className="quiz-actions">
              <button className="button" disabled={answer !== null}
                onClick={() => chooseAnswer(true)}>Escrocherie</button>
              <button className="button button-secondary" disabled={answer !== null}
                onClick={() => chooseAnswer(false)}>Pare legitim</button>
            </div>

            {answer !== null && (
              <div className={`notice ${answer === current.scam ? "notice-success" : "notice-danger"}`}>
                <strong>{answer === current.scam ? "Corect. " : "Nu chiar. "}</strong>
                {current.explanation}
                <button className="button next-question" onClick={nextQuestion}>
                  {question === quizQuestions.length - 1 ? "Vezi rezultatul" : "Următoarea"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AssistantMigrationNotice({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <section className="page">
      <div className="eyebrow">ASISTENT FINANCIAR</div>
      <h1>Asistentul Finconsult</h1>
      <div className="surface-card assistant-placeholder">
        <Icon name="fa-comments" />
        <h2>Interfața AI este următoarea componentă de migrat.</h2>
        <p>
          Configurarea furnizorilor va rămâne disponibilă, dar integrarea
          Ollama, Gemini și API-urilor compatibile va fi mutată într-un
          serviciu React separat.
        </p>
        <button className="button" onClick={onOpenSettings}>Deschide setările</button>
      </div>
    </section>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState(
    () => localStorage.getItem("finconsult-provider") || "ollama"
  );
  const [model, setModel] = useState(
    () => localStorage.getItem("finconsult-model") || "llama3.2"
  );
  const [endpoint, setEndpoint] = useState(
    () => localStorage.getItem("finconsult-endpoint") || "http://localhost:11434"
  );
  const [prompt, setPrompt] = useState(
    () => localStorage.getItem("finconsult-prompt") || "Ești asistentul financiar Finconsult. Răspunde clar, concis și în limba română."
  );
  const [status, setStatus] = useState("");

  const save = () => {
    localStorage.setItem("finconsult-provider", provider);
    localStorage.setItem("finconsult-model", model);
    localStorage.setItem("finconsult-endpoint", endpoint);
    localStorage.setItem("finconsult-prompt", prompt);
    setStatus("Preferințele au fost salvate.");
  };

  return createPortal(
    <div className="settings-overlay" onMouseDown={onClose}>
      <aside
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-heading">
          <div>
            <div className="eyebrow">CONFIGURARE</div>
            <h2 id="settings-title">Setări Finconsult</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Închide setările">
            <Icon name="fa-xmark" />
          </button>
        </div>

        <label>
          Furnizor AI
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="ollama">Ollama (local)</option>
            <option value="gemini">Google Gemini</option>
            <option value="openai">Compatibil OpenAI</option>
          </select>
        </label>

        <label>
          Model
          <input value={model} onChange={(e) => setModel(e.target.value)} />
        </label>

        {provider !== "gemini" && (
          <label>
            URL API
            <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </label>
        )}

        <label>
          System prompt
          <textarea rows={8} value={prompt}
            onChange={(e) => setPrompt(e.target.value)} />
        </label>

        <div className="notice notice-warning">
          Cheile API nu trebuie salvate în browser sau incluse în repository.
          Pentru o aplicație publică, apelurile cloud trebuie mutate într-un backend.
        </div>

        <div className="settings-footer">
          <span role="status">{status}</span>
          <button className="button" onClick={save}>Salvează preferințele</button>
        </div>
      </aside>
    </div>,
    document.body
  );
}