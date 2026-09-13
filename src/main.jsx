import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Building2,
  Users,
  Mic,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Upload,
  Square,
  Pause,
  Play,
  Download,
  X,
  Loader2,
  ShieldCheck,
  CalendarDays,
  BriefcaseBusiness,
  Heart,
  Target,
  Link as LinkIcon,
  Smartphone,
  RefreshCw,
  AlertCircle,
  Trash2,
  Pencil,
  Headphones,
  FolderOpen,
  LayoutDashboard,
} from "lucide-react";
import QRCode from "qrcode";
import "./styles.css";
const dims = {
  business: {
    label: "业务方向",
    caption: "看清业务，找到切入点",
    icon: BriefcaseBusiness,
  },
  needs: { label: "个人诉求", caption: "理解角色背后的期待", icon: Target },
  personal: { label: "个人客情", caption: "记住细节，建立信任", icon: Heart },
};
const states = {
  pending: "等待处理",
  transcribing: "正在转写",
  extracting: "正在提炼",
  waiting_transcription: "待配置转写",
  waiting_extraction: "待配置提炼",
  failed: "处理失败",
  done: "已归档",
};
const busyStates = ["pending", "transcribing", "extracting"];
const date = (v, short = false) =>
  v
    ? new Date(v).toLocaleDateString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        ...(short ? {} : { year: "numeric" }),
      })
    : "尚未拜访";
const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
async function api(url, options = {}) {
  const headers = {
    "X-Compass-Request": "1",
    ...(options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    ...options.headers,
  };
  const r = await fetch("/api" + url, {
    ...options,
    headers,
    body:
      options.body instanceof FormData
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "请求失败");
  return d;
}
function Button({
  children,
  icon: Icon,
  variant = "",
  className = "",
  ...props
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {Icon && <Icon size={17} />} {children}
    </button>
  );
}
function Empty({ icon: Icon = FolderOpen, title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={30} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    el?.focus();
    function keys(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = el.querySelectorAll(
          "button,input,select,textarea,a[href]",
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Status({ status }) {
  return (
    <span className={`status ${status}`}>
      {busyStates.includes(status) ? (
        <Loader2 size={12} className="spin" />
      ) : status === "done" ? (
        <Check size={12} />
      ) : (
        <span className="dot" />
      )}
      {states[status] || status}
    </span>
  );
}
function CustomerForm({ value, data, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(
    value || {
      company: "",
      department: "",
      name: "",
      title: "",
      contact: "",
      notes: "",
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title={value ? "编辑客户" : "新建客户档案"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(form);
            onClose();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="公司 *">
            <input
              list="companies"
              required
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
              placeholder="输入或选择公司"
            />
            <datalist id="companies">
              {data.companies.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </datalist>
          </Field>
          <Field label="业务部门 *">
            <input
              list="departments"
              required
              value={form.department}
              onChange={(e) => set("department", e.target.value)}
              placeholder="例如：数字化业务部"
            />
            <datalist id="departments">
              {data.departments
                .filter(
                  (d) =>
                    data.companies.find((c) => c.id === d.company_id)?.name ===
                    form.company,
                )
                .map((d) => (
                  <option key={d.id}>{d.name}</option>
                ))}
            </datalist>
          </Field>
          <Field label="客户姓名 *">
            <input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="客户姓名"
            />
          </Field>
          <Field label="职位 / 角色">
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="例如：采购负责人"
            />
          </Field>
        </div>
        <Field label="联系方式">
          <input
            value={form.contact}
            onChange={(e) => set("contact", e.target.value)}
            placeholder="电话、微信或邮箱"
          />
        </Field>
        <Field label="备注">
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="补充备注"
            rows={3}
          />
        </Field>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          {value && (
            <Button
              type="button"
              variant="danger-text"
              icon={Trash2}
              onClick={() => onDelete(value)}
            >
              删除客户
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={busy}>
            {busy ? "保存中…" : "保存客户"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function RelationshipTrace() {
  return (
    <svg
      className="relationship-trace"
      viewBox="0 0 620 300"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="trace-sage" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#78d6b0" stopOpacity="0.24" />
          <stop offset="0.48" stopColor="#43bfae" stopOpacity="0.78" />
          <stop offset="1" stopColor="#b8e86f" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="trace-blue" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#8adfc3" stopOpacity="0.16" />
          <stop offset="0.62" stopColor="#50c7bd" stopOpacity="0.62" />
          <stop offset="1" stopColor="#a7dc92" stopOpacity="0.34" />
        </linearGradient>
      </defs>
      <g fill="none" strokeLinecap="round">
        <path
          className="trace-line trace-line-main"
          d="M-20 242C82 222 96 86 196 104c88 16 80 124 168 110 94-15 95-154 276-142"
          stroke="url(#trace-sage)"
        />
        <path
          className="trace-line trace-line-secondary"
          d="M-18 270C100 250 113 134 218 150c92 14 94 104 170 88 83-18 116-124 252-98"
          stroke="url(#trace-blue)"
        />
        <path
          className="trace-line trace-line-fine"
          d="M34 302c86-76 106-152 194-140 79 11 108 82 176 57 66-24 96-92 230-88"
          stroke="#7bd3ad"
        />
        <path
          className="trace-line trace-line-fine trace-line-late"
          d="M146 310c42-80 75-110 134-104 70 7 91 61 152 34 58-26 88-70 190-66"
          stroke="#58bfb5"
        />
      </g>
      <g className="trace-nodes">
        <circle cx="196" cy="104" r="4" />
        <circle cx="364" cy="214" r="5" />
        <circle cx="498" cy="120" r="3.5" />
        <circle className="trace-node-accent" cx="552" cy="91" r="6" />
      </g>
    </svg>
  );
}
function Dashboard({ data, openCustomer, navigate, setModal, notify, reload }) {
  const reviews = data.customers.reduce((s, c) => s + c.review_count, 0);
  const metrics = [
    ["客户档案", data.customers.length, "位", Users],
    [
      "合作公司",
      new Set(data.customers.map((c) => c.company_id)).size,
      "家",
      Building2,
    ],
    ["待跟进事项", data.actions.length, "项", CheckCircle2],
    ["待核对信息", reviews, "条", AlertCircle],
  ];
  return (
    <>
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="hero-kicker">客户关系工作台</span>
          <h1>
            <span>记录每一次关系维护，</span>
            <span>让客户档案随交流</span>
            <span>持续生长。</span>
          </h1>
          <p>
            从拜访录音、客户判断到跟进行动，统一沉淀为可追溯、可持续更新的关系脉络。
          </p>
          <Button
            variant="primary"
            icon={Mic}
            onClick={() => navigate("capture")}
          >
            记录一次拜访
          </Button>
        </div>
        <div className="hero-visual">
          <RelationshipTrace />
          <span className="trace-caption">关系轨迹 · 持续更新</span>
        </div>
        <div className="hero-metrics">
          {metrics.map(([label, value, unit, Icon], index) => (
            <div className="hero-metric" key={label}>
              <span className="metric-index">0{index + 1}</span>
              <Icon size={15} strokeWidth={1.65} />
              <span className="metric-label">{label}</span>
              <strong className={label === "待核对信息" && value ? "amber" : ""}>
                {String(value).padStart(2, "0")}
                <small>{unit}</small>
              </strong>
            </div>
          ))}
        </div>
      </section>
      <div className="dashboard-grid">
        <section>
          <div className="section-heading">
            <h2>最近联系的客户</h2>
            <button
              className="text-button"
              onClick={() => navigate("customers")}
            >
              全部客户 <ArrowUpRight size={15} />
            </button>
          </div>
          {data.customers.length ? (
            <div className="customer-cards">
              {data.customers.slice(0, 4).map((c) => (
                <button
                  className="customer-card"
                  onClick={() => openCustomer(c.id)}
                  key={c.id}
                >
                  <div className="card-top">
                    <span className="avatar">{c.name[0]}</span>
                    <ArrowUpRight size={19} />
                  </div>
                  <h3>{c.name}</h3>
                  <p>{c.title || "职位待补充"}</p>
                  <div className="card-company">
                    <Building2 size={14} />
                    {c.company}
                    <span>{c.department}</span>
                  </div>
                  <div className="card-bottom">
                    <span>
                      {date(c.last_visit, true)}
                      {c.last_visit ? " · 最近拜访" : ""}
                    </span>
                    {c.review_count > 0 ? (
                      <span className="review-count">
                        {c.review_count} 条待核对
                      </span>
                    ) : (
                      <span>{c.visit_count} 次记录</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="panel">
              <Empty
                title="暂无客户"
                action={
                  <div className="inline-actions">
                    <Button
                      variant="primary"
                      icon={Plus}
                      onClick={() => setModal({ type: "customer" })}
                    >
                      新建客户
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          const r = await api("/demo", { method: "POST" });
                          await reload();
                          openCustomer(r.ids[0]);
                          notify("已创建 5 位示例客户，可随时删除");
                        } catch (e) {
                          notify(e.message, true);
                        }
                      }}
                    >
                      添加 5 位示例客户
                    </Button>
                  </div>
                }
              ></Empty>
            </div>
          )}
          <div className="section-heading spaced">
            <h2>最近的交流</h2>
          </div>
          <div className="panel recent-list">
            {data.recent.length ? (
              data.recent.map((v) => (
                <button
                  key={v.id}
                  className="recent-row"
                  onClick={() => setModal({ type: "visit", id: v.id })}
                >
                  <span className="round-icon">
                    <FileText size={17} />
                  </span>
                  <span className="grow">
                    <strong>{v.title}</strong>
                    <small>
                      {v.customer_name} · {date(v.happened_at)}
                    </small>
                  </span>
                  <Status status={v.status} />
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <p className="quiet-empty">暂无拜访记录</p>
            )}
          </div>
        </section>
        <aside>
          <section className="followup-panel">
            <div className="section-heading">
              <h2>待跟进</h2>
              <div className="followup-heading-actions">
                <span className="round-count">{data.actions.length}</span>
                <button
                  className="followup-add"
                  onClick={() => {
                    if (data.customers.length) {
                      setModal({ type: "action" });
                    } else {
                      notify("请先创建客户，再添加跟进事项");
                      setModal({ type: "customer" });
                    }
                  }}
                >
                  <Plus size={14} />
                  添加
                </button>
              </div>
            </div>

            {data.actions.length ? (
              <div className="task-list">
                {data.actions.slice(0, 8).map((a) => (
                  <div className="task" key={a.id}>
                    <button
                      className="check-button"
                      aria-label={"完成 " + a.text}
                      onClick={async () => {
                        await api("/actions/" + a.id, {
                          method: "PATCH",
                          body: { done: true },
                        });
                        reload();
                      }}
                    >
                      <span />
                    </button>
                    <div>
                      <button
                        className="task-title"
                        onClick={() => openCustomer(a.customer_id)}
                      >
                        {a.text}
                      </button>
                      <small>
                        {a.customer_name} · {a.due_date || "日期待定"}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="small-empty">
                <CheckCircle2 size={28} />
                <p>暂无待跟进事项</p>
                <small>
                  {data.customers.length
                    ? "添加下一步行动，持续推进客户关系"
                    : "先创建客户，再为其安排跟进"}
                </small>
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
function Customers({ data, openCustomer, setModal }) {
  const [q, setQ] = useState("");
  const [co, setCo] = useState("");
  const [dept, setDept] = useState("");
  const items = data.customers.filter(
    (c) =>
      (!co || co === c.company_id) &&
      (!dept || dept === c.department_id) &&
      [c.name, c.company, c.department, c.title, c.contact]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>客户档案</h1>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setModal({ type: "customer" })}
        >
          新建客户
        </Button>
      </div>
      <div className="directory-layout">
        <aside className="organization-tree">
          <button
            className={!co ? "selected" : ""}
            onClick={() => {
              setCo("");
              setDept("");
            }}
          >
            <Users size={17} />
            全部客户 <small>{data.customers.length}</small>
          </button>
          {data.companies.map((c) => (
            <div key={c.id}>
              <div className="tree-company">
                <button
                  className={co === c.id && !dept ? "selected" : ""}
                  onClick={() => {
                    setCo(c.id);
                    setDept("");
                  }}
                >
                  <Building2 size={16} />
                  {c.name}
                </button>
                <button
                  className="icon-button"
                  aria-label={"重命名公司 " + c.name}
                  onClick={() =>
                    setModal({
                      type: "organization",
                      entity: "companies",
                      value: c,
                    })
                  }
                >
                  <Pencil size={12} />
                </button>
              </div>
              {data.departments
                .filter((d) => d.company_id === c.id)
                .map((d) => (
                  <div className="tree-department" key={d.id}>
                    <button
                      className={dept === d.id ? "selected" : ""}
                      onClick={() => {
                        setCo(c.id);
                        setDept(d.id);
                      }}
                    >
                      └ <span>{d.name}</span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={"重命名部门 " + d.name}
                      onClick={() =>
                        setModal({
                          type: "organization",
                          entity: "departments",
                          value: d,
                        })
                      }
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </aside>
        <section>
          <div className="searchbar">
            <Search size={18} />
            <input
              aria-label="搜索客户"
              placeholder="搜索姓名、公司、部门或职位…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span>{items.length} 位客户</span>
          </div>
          {items.length ? (
            <div className="directory-table">
              <div className="table-header">
                <span>客户 / 职位</span>
                <span>公司 / 部门</span>
                <span>最近拜访</span>
                <span>档案状态</span>
              </div>
              {items.map((c) => (
                <button
                  className="table-row"
                  key={c.id}
                  onClick={() => openCustomer(c.id)}
                >
                  <div className="person-cell">
                    <span className="avatar small-avatar">{c.name[0]}</span>
                    <span>
                      <strong>{c.name}</strong>
                      <small>{c.title || "职位待补充"}</small>
                    </span>
                  </div>
                  <div>
                    <strong>{c.company}</strong>
                    <small>{c.department}</small>
                  </div>
                  <div>
                    <strong>{date(c.last_visit)}</strong>
                    <small>{c.visit_count} 次拜访记录</small>
                  </div>
                  <div>
                    {c.review_count ? (
                      <span className="review-count">
                        {c.review_count} 条待核对
                      </span>
                    ) : (
                      <span className="muted">已整理</span>
                    )}
                    <ChevronRight size={16} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="panel">
              <Empty icon={Search} title="未找到客户"></Empty>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
function CustomerDetail({
  cid,
  onBack,
  setModal,
  navigate,
  notify,
  refreshKey,
  reload,
}) {
  const [c, setC] = useState(null);
  const [tab, setTab] = useState("profile");
  const [showSource, setShowSource] = useState("");
  const get = () =>
    api("/customers/" + cid)
      .then(setC)
      .catch((e) => notify(e.message, true));
  useEffect(() => {
    get();
  }, [cid, refreshKey]);
  useEffect(() => {
    if (!c?.visits.some((v) => busyStates.includes(v.status))) return;
    const t = setTimeout(get, 3500);
    return () => clearTimeout(t);
  }, [c]);
  if (!c)
    return (
      <div className="loading">
        <Loader2 className="spin" />
        读取档案…
      </div>
    );
  const review = c.facts.filter((f) => f.status === "review");
  async function resolve(f, action) {
    try {
      await api("/facts/" + f.id + "/resolve", {
        method: "POST",
        body: { action },
      });
      await get();
      reload();
      notify("已更新档案");
    } catch (e) {
      notify(e.message, true);
    }
  }
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} /> 客户档案 <ChevronRight size={14} /> {c.company}
      </button>
      <section className="profile-header">
        <span className="avatar large-avatar">{c.name[0]}</span>
        <div className="grow">
          <div className="inline-actions">
            <h1>{c.name}</h1>
            <span className="role-tag">{c.title || "职位待补充"}</span>
          </div>
          <p>
            <Building2 size={15} />
            {c.company}
            <span>/</span>
            {c.department}
          </p>
          {c.contact && <small>{c.contact}</small>}
        </div>
        <div className="profile-buttons">
          <Button
            icon={Pencil}
            onClick={() => setModal({ type: "customer", value: c })}
          >
            编辑
          </Button>
          <a
            className="button"
            href={"/api/customers/" + cid + "/export"}
            download
          >
            <Download size={16} />
            导出档案
          </a>
          <Button
            variant="primary"
            icon={Mic}
            onClick={() => navigate("capture", cid)}
          >
            记录拜访
          </Button>
        </div>
      </section>
      <nav className="tabs">
        <button
          className={tab === "profile" ? "active" : ""}
          onClick={() => setTab("profile")}
        >
          客户全貌
        </button>
        <button
          className={tab === "visits" ? "active" : ""}
          onClick={() => setTab("visits")}
        >
          拜访时间线 <span>{c.visits.length}</span>
        </button>
        <button
          className={tab === "review" ? "active" : ""}
          onClick={() => setTab("review")}
        >
          待核对{" "}
          <span className={review.length ? "amber-badge" : ""}>
            {review.length}
          </span>
        </button>
      </nav>
      {tab === "profile" ? (
        <>
          <div className="dimensions">
            {Object.entries(dims).map(
              ([dim, { label, caption, icon: Icon }], index) => {
                const facts = c.facts.filter(
                  (f) => f.dimension === dim && f.status === "active",
                );
                return (
                  <section className={`dimension ${dim}`} key={dim}>
                    <div className="dimension-head">
                      <Icon size={21} strokeWidth={1.5} />
                      <h2>{label}</h2>
                      <span className="fact-count">{facts.length}</span>
                    </div>
                    <div className="dimension-facts">
                      {facts.length ? (
                        facts.map((f) => (
                          <article className="fact" key={f.id}>
                            <div className="fact-heading">
                              <h4>{f.field}</h4>
                              <button
                                className="icon-button"
                                aria-label={"修订 " + f.field}
                                onClick={() =>
                                  setModal({ type: "fact", value: f })
                                }
                              >
                                <Pencil size={12} />
                              </button>
                            </div>
                            <p>{f.value}</p>
                            {f.reason === "人工修订" && (
                              <small className="manual-tag">
                                人工修订 · 原话保留
                              </small>
                            )}
                            <button
                              className="source-button"
                              onClick={() =>
                                setShowSource(showSource === f.id ? "" : f.id)
                              }
                            >
                              <LinkIcon size={12} />
                              {f.sources.length} 次交流佐证
                              <ChevronDown size={12} />
                            </button>
                            {showSource === f.id && (
                              <div className="evidence">
                                {f.sources.map((s) => (
                                  <button
                                    key={s.visit_id}
                                    onClick={() =>
                                      setModal({
                                        type: "visit",
                                        id: s.visit_id,
                                      })
                                    }
                                  >
                                    <blockquote>“{s.quote}”</blockquote>
                                    <small>
                                      {date(s.happened_at)} · {s.title}
                                    </small>
                                  </button>
                                ))}
                              </div>
                            )}
                          </article>
                        ))
                      ) : (
                        <p className="dimension-empty">暂无记录</p>
                      )}
                    </div>
                  </section>
                );
              },
            )}
          </div>
          {c.notes && (
            <section className="customer-notes">
              <h3>档案备注</h3>
              <p>{c.notes}</p>
            </section>
          )}
          <section className="panel actions-panel">
            <div className="section-heading">
              <h2>跟进事项</h2>
              <Button
                icon={Plus}
                onClick={() => setModal({ type: "action", customer_id: cid })}
              >
                添加事项
              </Button>
            </div>
            {c.actions.length ? (
              c.actions.map((a) => (
                <div
                  className={"task " + (a.done ? "completed" : "")}
                  key={a.id}
                >
                  <button
                    className="check-button"
                    aria-label={(a.done ? "恢复 " : "完成 ") + a.text}
                    onClick={async () => {
                      await api("/actions/" + a.id, {
                        method: "PATCH",
                        body: { done: !a.done },
                      });
                      get();
                      reload();
                    }}
                  >
                    <span>{!!a.done && <Check size={12} />}</span>
                  </button>
                  <span className="grow">
                    {a.text}
                    <small>{a.due_date || "日期待定"}</small>
                    {a.quote && (
                      <small className="action-evidence">
                        {a.visit_id ? "原话：" : ""}
                        {a.quote}
                      </small>
                    )}
                  </span>
                  {a.visit_id && (
                    <button
                      className="source-button"
                      onClick={() =>
                        setModal({ type: "visit", id: a.visit_id })
                      }
                    >
                      查看来源 <ArrowUpRight size={12} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="muted">暂无跟进事项</p>
            )}
          </section>
        </>
      ) : tab === "visits" ? (
        <div className="timeline">
          {c.visits.length ? (
            c.visits.map((v) => (
              <article key={v.id} className="timeline-item">
                <div className="timeline-date">
                  {date(v.happened_at)}
                  <span />
                </div>
                <button
                  className="timeline-content"
                  onClick={() => setModal({ type: "visit", id: v.id })}
                >
                  <div className="section-heading">
                    <h3>{v.title}</h3>
                    <Status status={v.status} />
                  </div>
                  <p>{v.summary || v.error || "打开查看录音与文字稿"}</p>
                  <small>
                    {v.is_demo ? "示例 · " : ""}
                    {v.audio_name ? "含录音 · " : ""}
                    {v.transcript_length} 字文字稿 <ArrowUpRight size={13} />
                  </small>
                </button>
              </article>
            ))
          ) : (
            <Empty
              icon={Mic}
              title="暂无拜访记录"
              action={
                <Button
                  variant="primary"
                  onClick={() => navigate("capture", cid)}
                >
                  记录第一次拜访
                </Button>
              }
            ></Empty>
          )}
        </div>
      ) : (
        <section className="review-list">
          {review.length ? (
            <>
              {review.map((f) => (
                <article className="review-item" key={f.id}>
                  <span className="eyebrow">
                    {dims[f.dimension].label} / {f.field}
                  </span>
                  <h3>{f.value}</h3>
                  <p className="amber small">
                    {f.reason || "当前设置要求人工核对"}
                  </p>
                  {c.facts
                    .filter(
                      (x) =>
                        x.status === "active" &&
                        x.dimension === f.dimension &&
                        x.field === f.field,
                    )
                    .map((x) => (
                      <p className="old-value" key={x.id}>
                        已有记录：{x.value}
                      </p>
                    ))}
                  {f.sources.map((s) => (
                    <blockquote key={s.visit_id}>
                      “{s.quote}”{" "}
                      <button
                        className="text-button"
                        onClick={() =>
                          setModal({ type: "visit", id: s.visit_id })
                        }
                      >
                        {date(s.happened_at)} · 查看来源
                      </button>
                    </blockquote>
                  ))}
                  <div className="inline-actions">
                    <Button
                      variant="primary"
                      onClick={() => resolve(f, "replace")}
                    >
                      采用新信息，旧值留档
                    </Button>
                    <Button onClick={() => resolve(f, "accept")}>
                      并存保留
                    </Button>
                    <Button onClick={() => resolve(f, "discard")}>
                      忽略此条
                    </Button>
                  </div>
                </article>
              ))}
            </>
          ) : (
            <Empty icon={CheckCircle2} title="暂无待核对信息"></Empty>
          )}
          {c.facts.some((f) =>
            ["archived", "discarded"].includes(f.status),
          ) && (
            <details className="history-details">
              <summary>查看历史与已忽略信息</summary>
              {c.facts
                .filter((f) => ["archived", "discarded"].includes(f.status))
                .map((f) => (
                  <p key={f.id}>
                    {f.field}：{f.value}{" "}
                    <small>
                      （{f.status === "archived" ? "历史记录" : "已忽略"}）
                    </small>
                  </p>
                ))}
            </details>
          )}
        </section>
      )}
    </>
  );
}
function draftDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("compass-recording", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("draft");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function draftOp(mode, fn) {
  const db = await draftDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("draft", mode),
      s = t.objectStore("draft");
    let result;
    const r = fn(s);
    if (r)
      r.onsuccess = () => {
        result = r.result;
      };
    t.oncomplete = () => {
      db.close();
      resolve(result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}
function Capture({
  data,
  initialCustomer,
  navigate,
  setModal,
  notify,
  reload,
  onRecording,
}) {
  const [cid, setCid] = useState(initialCustomer || "");
  const [mode, setMode] = useState("record");
  const [title, setTitle] = useState("客户拜访");
  const [happened, setHappened] = useState(localNow());
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [recovered, setRecovered] = useState(false);
  const recorder = useRef(null),
    stream = useRef(null),
    chunks = useRef([]),
    index = useRef(0),
    wake = useRef(null);
  const requestId = useRef(
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
  );
  const metadata = useRef({});
  metadata.current = {
    cid,
    title,
    happened,
    requestId: requestId.current,
    mime: recorder.current?.mimeType,
  };
  useEffect(() => {
    let alive = true;
    draftOp("readonly", (s) => s.getAll())
      .then((rows) => {
        if (!alive || !rows?.length) return;
        const meta = rows.find((x) => x.meta)?.meta;
        const saved = rows.find((x) => x.file);
        const parts = rows
          .filter((x) => x.chunk)
          .sort((a, b) => a.index - b.index)
          .map((x) => x.chunk);
        let f = saved?.file;
        if (!f && parts.length) {
          const type = parts[0].type || meta?.mime || "audio/webm";
          f = new File(
            parts,
            "恢复的录音." + (type.includes("mp4") ? "m4a" : "webm"),
            { type },
          );
        }
        if (f) {
          setFile(f);
          setRecovered(true);
          if (meta) {
            if (meta.requestId) requestId.current = meta.requestId;
            setCid(meta.cid || "");
            setTitle(meta.title || "客户拜访");
            setHappened(meta.happened || localNow());
          }
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      recorder.current?.state !== "inactive" && recorder.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      wake.current?.release().catch(() => {});
      onRecording(false);
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setAudioUrl("");
      return;
    }
    const u = URL.createObjectURL(file);
    setAudioUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => {
    if (!recording || paused) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording, paused]);
  useEffect(() => {
    const prevent = (e) => {
      if (recording || file || text) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [recording, file, text]);
  useEffect(() => {
    const handler = (e) => {
      if (
        text.trim() &&
        !confirm("文字记录尚未提交，离开将丢失这段文字。确定离开？")
      )
        e.preventDefault();
    };
    window.addEventListener("compass-navigate", handler);
    return () => window.removeEventListener("compass-navigate", handler);
  }, [text]);
  useEffect(() => {
    if (file)
      draftOp("readwrite", (store) =>
        store.put({ meta: metadata.current }, "meta"),
      ).catch(() => {});
  }, [cid, title, happened, file]);
  async function saveDraft(f) {
    setFile(f);
    try {
      await draftOp("readwrite", (s) => {
        s.clear();
        s.put({ file: f }, "file");
        s.put({ meta: metadata.current }, "meta");
      });
    } catch {
      setError("浏览器未能保存本机草稿，请及时下载或提交录音，避免刷新丢失。");
    }
  }
  async function start() {
    setError("");
    if (!cid) {
      setError("请先选择这次拜访的客户");
      return;
    }
    if (!consent) {
      setError("请先确认已取得录音与信息整理授权");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMode("upload");
      setError(
        "当前浏览器环境无法直接录音。请用手机系统录音，再在这里上传；HTTPS 下可直接录音。",
      );
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const type = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(
        stream.current,
        type
          ? { mimeType: type, audioBitsPerSecond: 64000 }
          : { audioBitsPerSecond: 64000 },
      );
      recorder.current = r;
      chunks.current = [];
      index.current = 0;
      setFile(null);
      setRecovered(false);
      await draftOp("readwrite", (s) => s.clear()).catch(() => {});
      await draftOp("readwrite", (s) =>
        s.put({ meta: { ...metadata.current, mime: r.mimeType } }, "meta"),
      ).catch(() => {});
      r.ondataavailable = (e) => {
        if (!e.data.size) return;
        chunks.current.push(e.data);
        const n = index.current++;
        draftOp("readwrite", (s) =>
          s.put(
            { chunk: e.data, index: n },
            "chunk-" + String(n).padStart(6, "0"),
          ),
        ).catch(() => setError("本机草稿备份失败，请停止录音并下载文件保存。"));
        if (
          chunks.current.reduce((s, c) => s + c.size, 0) >
          190 * 1024 * 1024
        ) {
          r.stop();
          setError("录音接近 200 MB，已自动停止，请先提交本次录音。");
        }
      };
      r.onerror = () => {
        setError("录音被浏览器中断，已保留收集到的片段，请试听或下载检查。");
        if (r.state !== "inactive") r.stop();
      };
      r.onstop = () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setPaused(false);
        onRecording(false);
        wake.current?.release().catch(() => {});
        const ext = r.mimeType.includes("mp4")
          ? "m4a"
          : r.mimeType.includes("ogg")
            ? "ogg"
            : "webm";
        const f = new File(
          chunks.current,
          `拜访录音-${new Date().toISOString().slice(0, 10)}.${ext}`,
          { type: r.mimeType },
        );
        saveDraft(f);
      };
      r.start(5000);
      setSeconds(0);
      setRecording(true);
      onRecording(true);
      try {
        wake.current = await navigator.wakeLock?.request("screen");
      } catch {}
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(
        e.name === "NotAllowedError"
          ? "麦克风权限未开启，请在浏览器设置中允许，或改用录音上传。"
          : "无法开始录音：" + e.message,
      );
    }
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!cid || !consent) {
      setError("请选择客户并确认授权");
      return;
    }
    if (!file && !text.trim()) {
      setError("请录音、上传文件或填写文字记录");
      return;
    }
    if (recording) return;
    setSaving(true);
    try {
      const f = new FormData();
      f.set("customer_id", cid);
      f.set("request_id", requestId.current);
      f.set("title", title);
      f.set("happened_at", new Date(happened).toISOString());
      f.set("consent", "true");
      if (file) f.set("audio", file);
      if (text.trim()) f.set("transcript", text.trim());
      const r = await api("/visits", { method: "POST", body: f });
      setSuccess(r);
      requestId.current =
        Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      setFile(null);
      setText("");
      await draftOp("readwrite", (s) => s.clear()).catch(() => {});
      reload();
      notify("拜访已保存，后台将按模型配置继续处理");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  if (success)
    return (
      <div className="capture-success">
        <span className="success-mark">
          <Check size={38} />
        </span>

        <h1>已保存</h1>

        <div className="inline-actions">
          <Button
            variant="primary"
            onClick={() => setModal({ type: "visit", id: success.id })}
          >
            查看处理进度
          </Button>
          <Button onClick={() => navigate("customers", success.customer_id)}>
            打开客户档案
          </Button>
        </div>
        <button
          className="text-button"
          onClick={() => {
            setSuccess(null);
            setSeconds(0);
            setHappened(localNow());
          }}
        >
          继续记录 <ArrowUpRight size={14} />
        </button>
      </div>
    );
  return (
    <div className="capture-wrap">
      <div className="page-heading">
        <div>
          <h1>记录拜访</h1>
        </div>
      </div>
      <form onSubmit={submit}>
        <div className="capture-grid">
          <section className="capture-main">
            <div className="capture-customer">
              <Field label="选择客户 *">
                <select
                  aria-label="选择客户"
                  required
                  value={cid}
                  disabled={recording}
                  onChange={(e) => setCid(e.target.value)}
                >
                  <option value="">请选择公司 / 部门 / 客户</option>
                  {data.customers.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.company} / {c.department} / {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              {!data.customers.length && (
                <Button
                  type="button"
                  icon={Plus}
                  onClick={() => setModal({ type: "customer" })}
                >
                  先新建客户
                </Button>
              )}
              <details className="capture-meta" open={window.innerWidth > 700}>
                <summary>
                  拜访标题与时间 <ChevronDown size={13} />
                </summary>
                <div className="form-grid">
                  <Field label="拜访标题">
                    <input
                      required
                      maxLength={200}
                      value={title}
                      disabled={recording}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="例如：试点方案沟通"
                    />
                  </Field>
                  <Field label="拜访时间">
                    <input
                      type="datetime-local"
                      required
                      value={happened}
                      disabled={recording}
                      onChange={(e) => setHappened(e.target.value)}
                    />
                  </Field>
                </div>
              </details>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  required
                />
                <span>已获对方同意录音并整理客户档案</span>
              </label>
            </div>
            <div className="capture-editor">
              <div className="segmented">
                {[
                  ["record", "直接录音", Mic],
                  ["upload", "上传录音", Upload],
                  ["text", "文字记录", FileText],
                ].map(([v, l, Icon]) => (
                  <button
                    type="button"
                    disabled={recording}
                    key={v}
                    onClick={() => setMode(v)}
                    className={mode === v ? "active" : ""}
                  >
                    <Icon size={16} />
                    {l}
                  </button>
                ))}
              </div>
              {mode === "record" ? (
                <div
                  className={"recorder " + (recording ? "is-recording" : "")}
                >
                  <div className="waveform">
                    {Array.from({ length: 35 }, (_, i) => (
                      <i
                        key={i}
                        style={{
                          height: 10 + Math.abs(Math.sin(i * 1.4)) * 28 + "px",
                          animationDelay: i * 0.045 + "s",
                        }}
                      />
                    ))}
                  </div>
                  <div className="record-time">
                    {String(Math.floor(seconds / 60)).padStart(2, "0")}
                    <span>:</span>
                    {String(seconds % 60).padStart(2, "0")}
                  </div>
                  <p>
                    {recording
                      ? paused
                        ? "已暂停"
                        : "正在录音"
                      : file
                        ? "可试听"
                        : "准备录音"}
                  </p>
                  <div className="record-controls">
                    {recording ? (
                      <>
                        <Button
                          type="button"
                          icon={paused ? Play : Pause}
                          onClick={() => {
                            if (paused) {
                              recorder.current.resume();
                            } else {
                              recorder.current.pause();
                            }
                            setPaused(!paused);
                          }}
                        >
                          {paused ? "继续" : "暂停"}
                        </Button>
                        <button
                          aria-label="结束录音"
                          type="button"
                          className="record-button stop"
                          onClick={() => recorder.current.stop()}
                        >
                          <Square size={24} fill="currentColor" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="record-button"
                        aria-label="开始录音"
                        disabled={!!file}
                        onClick={start}
                      >
                        <Mic size={30} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                  {recording && <small>保持页面前台，避免锁屏中断。</small>}
                </div>
              ) : mode === "upload" ? (
                <label className="upload-zone">
                  <span className="upload-circle">
                    <Upload size={27} />
                  </span>
                  <h3>选择录音文件</h3>

                  <small>MP3 / M4A / WAV / WEBM 等 · ≤ 200 MB</small>
                  <input
                    aria-label="上传录音"
                    type="file"
                    accept="audio/*,.m4a,.mp4,.webm,.amr"
                    onChange={(e) => {
                      const f = e.target.files[0];
                      if (f) {
                        if (f.size > 200 * 1024 * 1024) {
                          setError("文件不能超过 200 MB");
                          return;
                        }
                        saveDraft(f);
                        setError("");
                      }
                    }}
                  />
                </label>
              ) : (
                <Field label="粘贴文字稿或会后记录">
                  <textarea
                    rows={12}
                    value={text}
                    maxLength={200000}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="客户：我们目前最关注的是…&#10;销售：您希望这次项目先解决什么问题？&#10;客户：…"
                  />
                </Field>
              )}
              {file && (
                <div className="audio-preview">
                  <div className="inline-actions">
                    <Headphones size={18} />
                    <strong>{file.name}</strong>
                    <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="移除录音"
                      onClick={() => {
                        if (
                          confirm(
                            "移除此录音草稿？尚未提交的录音将从本机清除。",
                          )
                        ) {
                          setFile(null);
                          draftOp("readwrite", (s) => s.clear()).catch(
                            () => {},
                          );
                          setRecovered(false);
                        }
                      }}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <audio controls src={audioUrl} />
                  <a
                    href={audioUrl}
                    download={file.name}
                    className="text-button"
                  >
                    <Download size={14} />
                    下载录音备份
                  </a>
                  {recovered && (
                    <p className="amber small">已恢复本机草稿，请先试听。</p>
                  )}
                </div>
              )}
            </div>
            {error && (
              <div className="error error-box" role="alert">
                <AlertCircle size={17} />
                {error}
              </div>
            )}
            <div className="capture-submit">
              <Button
                variant="primary"
                disabled={saving || recording || (!file && !text.trim())}
                icon={saving ? Loader2 : ArrowUpRight}
              >
                {saving ? "正在上传，请勿关闭…" : "保存并更新客户档案"}
              </Button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
function VisitModal({ vid, onClose, notify, reload }) {
  const [v, setV] = useState(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () =>
    api("/visits/" + vid)
      .then(setV)
      .catch((e) => notify(e.message, true));
  useEffect(() => {
    load();
  }, [vid]);
  useEffect(() => {
    if (!v || !busyStates.includes(v.status)) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [v]);
  return (
    <Modal wide title={v?.title || "拜访记录"} onClose={onClose}>
      {v ? (
        <>
          <div className="visit-meta">
            <span>
              {date(v.happened_at)}
              {v.is_demo ? " · 示例" : ""}
            </span>
            <Status status={v.status} />
          </div>
          {v.has_audio && (
            <div className="audio-preview">
              <div className="inline-actions">
                <Headphones size={16} />
                <strong>{v.audio_name}</strong>
              </div>
              <audio controls src={"/api/visits/" + vid + "/audio"} />
              <a
                className="text-button"
                href={"/api/visits/" + vid + "/audio"}
                download={v.audio_name}
              >
                <Download size={14} />
                下载原始录音
              </a>
            </div>
          )}
          {v.error && <p className="error error-box">{v.error}</p>}
          {v.status.startsWith("waiting_") && (
            <div className="info-box">
              {v.status === "waiting_transcription"
                ? "请配置转写模型，或补充文字稿。"
                : "请配置提炼模型。"}
              配置后重试。
            </div>
          )}
          {v.summary && (
            <section className="visit-summary">
              <h3>拜访摘要</h3>
              <p>{v.summary}</p>
            </section>
          )}
          <div className="section-heading">
            <h3>原始文字稿</h3>
            {!busyStates.includes(v.status) && v.status !== "done" && (
              <button
                className="text-button"
                onClick={() => {
                  setText(v.transcript);
                  setEditing(!editing);
                }}
              >
                {editing ? "取消编辑" : "补充 / 修正文字稿"}
                <Pencil size={13} />
              </button>
            )}
          </div>
          {editing ? (
            <textarea
              className="transcript-editor"
              rows={12}
              maxLength={200000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          ) : (
            <pre className="transcript">
              {v.transcript || "尚未生成文字稿。"}
            </pre>
          )}
          <div className="modal-actions">
            <Button
              variant="danger-text"
              icon={Trash2}
              disabled={busy || busyStates.includes(v.status)}
              onClick={async () => {
                if (
                  !confirm(
                    "删除本次拜访及录音？仅由本次拜访支撑的档案信息和跟进事项也会移除。",
                  )
                )
                  return;
                try {
                  await api("/visits/" + vid, { method: "DELETE" });
                  reload();
                  onClose();
                  notify("已删除本次拜访");
                } catch (e) {
                  notify(e.message, true);
                }
              }}
            >
              删除本次记录
            </Button>
            {!busyStates.includes(v.status) && v.status !== "done" && (
              <Button
                disabled={busy}
                variant="primary"
                icon={RefreshCw}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("/visits/" + vid + "/retry", {
                      method: "POST",
                      body: editing ? { transcript: text } : {},
                    });
                    setEditing(false);
                    load();
                    reload();
                  } catch (e) {
                    notify(e.message, true);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {editing ? "保存文字并处理" : "重试处理"}
              </Button>
            )}
            <Button onClick={onClose}>关闭</Button>
          </div>
        </>
      ) : (
        <div className="loading">
          <Loader2 className="spin" />
          读取记录…
        </div>
      )}
    </Modal>
  );
}
function SettingsPage({ notify, reload }) {
  const [s, setS] = useState(null);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    api("/settings")
      .then(setS)
      .catch((e) => notify(e.message, true));
  }, []);
  useEffect(() => {
    const url = s?.publicUrl || window.location.origin;
    QRCode.toDataURL(url + "/capture", {
      width: 180,
      margin: 1,
      color: { dark: "#203e36", light: "#ffffff" },
    }).then(setQr);
  }, [s?.publicUrl]);
  if (!s)
    return (
      <div className="loading">
        <Loader2 className="spin" />
        读取设置…
      </div>
    );
  const set = (type, k, v) =>
    setS((x) => ({ ...x, [type]: { ...x[type], [k]: v } }));
  async function save() {
    setBusy("save");
    try {
      const saved = await api("/settings", { method: "PUT", body: s });
      setS({ ...s, ...saved });
      notify("设置已保存");
      reload();
      return true;
    } catch (e) {
      notify(e.message, true);
      return false;
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>工作台设置</h1>
        </div>
        <Button variant="primary" icon={Check} disabled={!!busy} onClick={save}>
          {busy === "save" ? "保存中…" : "保存设置"}
        </Button>
      </div>
      <div className="settings-grid">
        <section>
          <div className="settings-card">
            <div className="section-heading">
              <h2>模型连接</h2>
              <span className="soft-tag">OpenAI 兼容接口</span>
            </div>

            {[
              ["asr", "语音转文字", Mic, "将录音转换为完整文字稿"],
              [
                "llm",
                "客户信息提炼",
                FileText,
                "从文字稿提取三个维度的信息和跟进事项",
              ],
            ].map(([type, label, Icon, caption]) => (
              <div className="model-block" key={type}>
                <div className="model-title">
                  <span className="round-icon">
                    <Icon size={19} />
                  </span>
                  <div className="grow">
                    <h3>{label}</h3>
                  </div>
                  <span
                    className={
                      "status " +
                      (s[type].hasKey ? "done" : "waiting_extraction")
                    }
                  >
                    {s[type].hasKey ? "密钥已保存" : "待配置"}
                  </span>
                </div>
                <Field label="API Base URL">
                  <input
                    type="url"
                    value={s[type].baseUrl}
                    onChange={(e) => set(type, "baseUrl", e.target.value)}
                    placeholder="https://api.example.com/v1"
                  />
                </Field>
                <div className="form-grid">
                  <Field label="模型名称">
                    <input
                      value={s[type].model}
                      onChange={(e) => set(type, "model", e.target.value)}
                      placeholder={
                        type === "asr" ? "whisper-1" : "服务商提供的模型标识"
                      }
                    />
                  </Field>
                  <Field label="API Key">
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={s[type].apiKey}
                      onChange={(e) => set(type, "apiKey", e.target.value)}
                      placeholder={
                        s[type].hasKey ? "已保存 · 留空保留" : "输入 API Key"
                      }
                    />
                  </Field>
                </div>
                <div className="model-bottom">
                  {type === "asr" ? (
                    <Field label="语言（留空自动识别）">
                      <input
                        value={s.asr.language}
                        onChange={(e) => set(type, "language", e.target.value)}
                        placeholder="zh"
                      />
                    </Field>
                  ) : null}
                  <Button
                    disabled={!!busy}
                    icon={RefreshCw}
                    onClick={async () => {
                      if (!(await save())) return;
                      setBusy(type);
                      try {
                        await api("/settings/test/" + type, { method: "POST" });
                        notify(label + "连接成功");
                      } catch (e) {
                        notify(e.message, true);
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    {busy === type ? "测试中…" : "保存并测试"}
                  </Button>
                </div>
                <label className="clear-key">
                  <input
                    type="checkbox"
                    checked={!!s[type].clearKey}
                    onChange={(e) => set(type, "clearKey", e.target.checked)}
                  />
                  保存时清除密钥
                </label>
              </div>
            ))}
            <details className="inline-help">
              <summary>接口说明</summary>
              <p>
                Base URL 不含末尾路径。转写追加 /audio/transcriptions，提炼追加
                /chat/completions；提炼模型须支持 JSON 输出。
              </p>
              <p>密钥留空保留。录音和文字发送至所选服务商。</p>
            </details>
            <p className="privacy-note">
              <ShieldCheck size={16} />
              处理会发送资料至所选服务商，测试与处理按其规则计费。
            </p>
          </div>
          <div className="settings-card">
            <h2>档案更新方式</h2>
            <label className="toggle-row">
              <div>
                <strong>自动归档</strong>
                <p>明确的新信息自动入档，冲突信息待核对。</p>
              </div>
              <input
                role="switch"
                type="checkbox"
                checked={s.autoApply}
                onChange={(e) => setS({ ...s, autoApply: e.target.checked })}
              />
            </label>
            <Button
              icon={RefreshCw}
              disabled={!!busy}
              onClick={async () => {
                if (!(await save())) return;
                try {
                  const r = await api("/resume", { method: "POST" });
                  notify(`已继续处理 ${r.count} 条等待配置的记录`);
                  reload();
                } catch (e) {
                  notify(e.message, true);
                }
              }}
            >
              保存并继续处理
            </Button>
          </div>
        </section>
        <aside>
          <div className="settings-card phone-card">
            <Smartphone size={26} strokeWidth={1.5} />
            <h2>手机入口</h2>

            {qr && (
              <img src={qr} width={180} height={180} alt="手机录音入口二维码" />
            )}
            <Field label="访问地址">
              <input
                type="url"
                placeholder="https://your-domain.example"
                value={s.publicUrl}
                onChange={(e) => setS({ ...s, publicUrl: e.target.value })}
              />
            </Field>
            <p className="small">扫码打开 · 直接录音需 HTTPS</p>
            {(!s.publicUrl ||
              s.publicUrl.includes("127.0.0.1") ||
              s.publicUrl.includes("localhost")) && (
              <p className="amber small">请填写手机可访问的地址。</p>
            )}
            <details>
              <summary>本机局域网地址参考</summary>
              {s.lanUrls.map((u) => (
                <code key={u}>{u}</code>
              ))}
              <p className="small">同一 Wi-Fi 下使用。</p>
            </details>
          </div>
          <div className="settings-card">
            <h2>资料导出</h2>
            <p className="muted">含档案、文字稿与跟进事项，不含音频及密钥。</p>
            <a className="button full" href="/api/export" download>
              <Download size={16} />
              导出全部资料 JSON
            </a>
            <p className="small muted">录音可在拜访记录中单独下载。</p>
          </div>
          <details className="settings-card inline-help">
            <summary>关于工作台</summary>
            <p>当前工作台不设访问密码，任何获得网址的人均可访问全部资料。</p>
          </details>
        </aside>
      </div>
    </>
  );
}
function SimpleFormModal({ modal, data, onClose, reload, notify }) {
  const [value, setValue] = useState(modal.value?.name || "");
  const [customerId, setCustomerId] = useState(
    modal.customer_id || data.customers[0]?.id || "",
  );
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const org = modal.type === "organization";
  return (
    <Modal
      title={
        org
          ? "重命名" + (modal.entity === "companies" ? "公司" : "部门")
          : "添加跟进事项"
      }
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              org
                ? "/organizations/" + modal.entity + "/" + modal.value.id
                : "/actions",
              {
                method: org ? "PATCH" : "POST",
                body: org
                  ? { name: value }
                  : {
                      customer_id: customerId,
                      text: value,
                      due_date: due,
                    },
              },
            );
            reload();
            onClose();
            notify("已保存");
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {!org && !modal.customer_id && (
          <Field label="跟进客户">
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {data.customers.map((customer) => (
                <option value={customer.id} key={customer.id}>
                  {customer.name} · {customer.company}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={org ? "名称" : "跟进内容"}>
          <input
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={org ? 200 : 1000}
          />
        </Field>
        {!org && (
          <Field label="计划日期（可选）">
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
        )}
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={busy}>
            保存
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function FactEditor({ fact, onClose, notify, reload }) {
  const [field, setField] = useState(fact.field);
  const [value, setValue] = useState(fact.value);
  const [dimension, setDimension] = useState(fact.dimension);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="修订档案信息" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/facts/" + fact.id, {
              method: "PATCH",
              body: { field, value, dimension },
            });
            reload();
            onClose();
            notify("修订已保存，原记录已留档");
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted small">旧值与来源保留。</p>
        <Field label="信息维度">
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
          >
            {Object.entries(dims).map(([d, x]) => (
              <option value={d} key={d}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="字段名称">
          <input
            required
            maxLength={100}
            value={field}
            onChange={(e) => setField(e.target.value)}
          />
        </Field>
        <Field label="修订后的内容">
          <textarea
            required
            rows={4}
            maxLength={2000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={busy}>
            保存修订
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function App() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(
    window.location.pathname === "/capture" ? "capture" : "dashboard",
  );
  const [cid, setCid] = useState("");
  const [captureCid, setCaptureCid] = useState("");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [revision, setRevision] = useState(0);
  const [recording, setRecording] = useState(false);
  const toastTimer = useRef();
  function notify(message, error = false) {
    setToast({ message, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }
  async function reload() {
    try {
      setData(await api("/bootstrap"));
      setRevision((x) => x + 1);
    } catch (e) {
      notify(e.message, true);
    }
  }
  useEffect(() => {
    reload();
  }, []);
  useEffect(() => {
    if (!data?.recent.some((v) => busyStates.includes(v.status))) return;
    const t = setTimeout(reload, 4000);
    return () => clearTimeout(t);
  }, [data]);
  function navigate(p, customerId = "") {
    if (recording) {
      notify("请先结束录音，再切换页面。", true);
      return;
    }
    const event = new Event("compass-navigate", { cancelable: true });
    if (!window.dispatchEvent(event)) return;
    setPage(p);
    if (p === "customers") setCid(customerId);
    if (p === "capture") setCaptureCid(customerId);
    window.history.replaceState(null, "", p === "capture" ? "/capture" : "/");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function openCustomer(id) {
    navigate("customers", id);
  }
  if (!data)
    return (
      <div className="loading screen">
        <Loader2 className="spin" />
        正在读取工作台…{toast && <p className="error">{toast.message}</p>}
      </div>
    );
  const nav = [
    ["dashboard", "工作台", LayoutDashboard],
    ["customers", "客户档案", Users],
    ["capture", "拜访记录", Mic],
    ["settings", "设置", Settings],
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="wordmark" onClick={() => navigate("dashboard")}>
          <span className="brand-symbol">井</span>
          <span>客序</span>
        </button>

        <nav>
          {nav.map(([p, label, Icon]) => (
            <button
              key={p}
              className={page === p ? "active" : ""}
              onClick={() => navigate(p)}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{label}</span>
              {page === p && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <span className="user-avatar">我</span>
            <span>
              我的工作台<small>公开访问</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            客序 <ChevronRight size={13} />{" "}
            {nav.find((x) => x[0] === page)?.[1]}
          </span>
          <div>
            <span className="today">
              {new Date().toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </span>
            <span className="topbar-divider" />
            <span className="user-avatar small-user">我</span>
          </div>
        </header>
        <main className="page-content">
          {page === "dashboard" ? (
            <Dashboard
              {...{ data, openCustomer, navigate, setModal, notify, reload }}
            />
          ) : page === "customers" ? (
            cid ? (
              <CustomerDetail
                {...{ cid, setModal, navigate, notify, reload }}
                refreshKey={revision}
                onBack={() => setCid("")}
              />
            ) : (
              <Customers {...{ data, openCustomer, setModal }} />
            )
          ) : page === "capture" ? (
            <Capture
              key={captureCid}
              {...{ data, navigate, setModal, notify, reload }}
              initialCustomer={captureCid}
              onRecording={setRecording}
            />
          ) : (
            <SettingsPage {...{ notify, reload }} />
          )}
        </main>
      </div>
      <nav className="mobile-nav">
        {nav.map(([p, label, Icon]) => (
          <button
            key={p}
            className={page === p ? "active" : ""}
            onClick={() => navigate(p)}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div
          className={"toast " + (toast.error ? "toast-error" : "")}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
          <button aria-label="关闭提示" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal?.type === "customer" && (
        <CustomerForm
          value={modal.value}
          data={data}
          onClose={() => setModal(null)}
          onSave={async (value) => {
            const c = await api(
              modal.value ? "/customers/" + modal.value.id : "/customers",
              { method: modal.value ? "PUT" : "POST", body: value },
            );
            await reload();
            if (page === "customers") setCid(c.id);
            notify("客户档案已保存");
          }}
          onDelete={async (value) => {
            if (
              !confirm(
                `删除 ${value.name} 的完整档案、拜访记录和录音？此操作不可恢复。`,
              )
            )
              return;
            try {
              await api("/customers/" + value.id, { method: "DELETE" });
              setModal(null);
              setCid("");
              reload();
              notify("客户档案已删除");
            } catch (e) {
              notify(e.message, true);
            }
          }}
        />
      )}{" "}
      {modal?.type === "visit" && (
        <VisitModal
          vid={modal.id}
          onClose={() => {
            setModal(null);
            reload();
          }}
          {...{ notify, reload }}
        />
      )}
      {modal?.type === "fact" && (
        <FactEditor
          fact={modal.value}
          onClose={() => setModal(null)}
          {...{ notify, reload }}
        />
      )}
      {["organization", "action"].includes(modal?.type) && (
        <SimpleFormModal
          key={modal.type + (modal.value?.id || "")}
          {...{ modal, data, reload, notify }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
