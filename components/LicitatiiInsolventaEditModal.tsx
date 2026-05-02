"use client";

/**
 * Modal dedicat pentru editarea anunțurilor licitații insolvență (din Panel admin).
 * Toate câmpurile produsului – fără a modifica ManualAddModalExecutor.
 */

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface LicitatiiInsolventaEditModalProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  editingProductId: string | null;
  onProductAdded?: () => void;
}

const roundTo = (value: number, decimals = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const COUNTIES = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani",
  "Brașov", "Brăila", "București", "Buzău", "Caraș-Severin", "Călărași", "Cluj", "Constanța",
  "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita",
  "Hunedoara", "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți", "Mureș",
  "Neamț", "Olt", "Prahova", "Sălaj", "Satu Mare", "Sibiu", "Suceava",
  "Teleorman", "Timiș", "Tulcea", "Vâlcea", "Vaslui", "Vrancea",
];

const CATEGORIES = [
  "Executări", "Imobiliare", "Autovehicule", "Utilaje & Echipamente", "Artă & Antichități",
  "Electronice & Tehnologie", "Casă & Grădină", "Modă & Lifestyle", "Mama și copilul",
  "Agricultură & Zootehnie", "Maritime & Aeronautice", "Business", "Materiale Construcții", "Diverse / Speciale",
];

const SUBCATEGORIES: Record<string, string[]> = {
  "Executări": ["exec-imobiliare", "exec-autovehicule", "exec-industrial", "exec-afaceri", "exec-office", "exec-altele"],
  "Imobiliare": ["Apartamente", "Case și Vile", "Terenuri Intravilane", "Terenuri Agricole", "Spații Comerciale", "Hale Industriale", "Proprietăți Turistice"],
  "Autovehicule": ["Autoturisme", "SUV / 4x4", "Motociclete și Scutere", "Camioane", "Remorci și Semiremorci", "Autorulote / Rulote", "Vehicule Electrice", "Piese Auto și Accesorii"],
  "Utilaje & Echipamente": ["Utilaje Construcții", "Utilaje Agricole", "Echipamente Forestiere", "Generatoare și Compresoare", "Scule Profesionale", "Echipamente Ateliere Auto", "Echipamente Electrice / Sudură"],
  "Artă & Antichități": ["Picturi", "Sculpturi", "Bijuterii și Ceasuri", "Obiecte de Colecție", "Mobilier de Epocă", "Cărți Rare, Hărți Vechi", "Fotografie Artistică", "Licitații Caritabile"],
  "Electronice & Tehnologie": ["Laptopuri și PC-uri", "Telefoane Mobile", "Tablete", "TV & Audio", "Console & Jocuri", "Drone & Gadgeturi Smart", "Echipamente Foto/Video"],
  "Casă & Grădină": ["Mobilier Interior", "Mobilier Exterior", "Echipamente de Grădinărit", "Decorațiuni", "Electrocasnice"],
  "Modă & Lifestyle": ["Haine de Designer", "Încălțăminte", "Genți & Accesorii", "Parfumuri & Cosmetice", "Ceasuri de Lux"],
  "Mama și copilul": ["Haine copil", "Încălțăminte copil", "Jucării", "Mobilier copil", "Coșul copilului", "Îngrijire bebeluși", "Scaune auto copil", "Cărucioare", "Hranire copil"],
  "Agricultură & Zootehnie": ["Tractoare, Combine", "Remorci Agricole", "Echipamente de Irigații", "Animale", "Semințe, Furaje, Îngrășăminte"],
  "Maritime & Aeronautice": ["Bărci, Iahturi, Skijeturi", "Motoare Marine", "Avioane Mici / Ultraleușoare", "Dronuri Industriale"],
  "Business": ["Echipamente de Birou", "Mobilier Comercial", "Calculatoare Second-Hand", "Licitații Lichidări Firme", "Loturi Stocuri Produse"],
  "Materiale Construcții": ["Ciment, Cărămidă, Oțel", "Materiale Izolație", "Feronerie, Unelte", "Uși, Ferestre, Tâmplărie"],
  "Diverse / Speciale": ["Licitații Caritabile", "Obiecte Militare / Istorice", "NFT / Artă Digitală", "Colecții Private", "Bunuri Confiscate / Execuții"],
};

function buildAuctionDate(dateStr: string | null, timeStr: string | null): string | null {
  if (!dateStr) return null;
  const datePart = dateStr.includes("T") ? dateStr.slice(0, 10) : dateStr;
  if (timeStr && /^\d{1,2}:\d{2}$/.test(timeStr)) return `${datePart}T${timeStr}:00`;
  return datePart;
}

export default function LicitatiiInsolventaEditModal({
  showModal,
  setShowModal,
  editingProductId,
  onProductAdded,
}: LicitatiiInsolventaEditModalProps) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    subcategory: "",
    categoryLevel3: "",
    sku: "",
    currency: "RON" as "RON" | "EUR",
    priceRon: 0,
    priceEur: 0,
    county: "",
    city: "",
    address: "",
    productLocation: "",
    auctionLocation: "",
    auctionDate: "",
    auctionTime: "",
    auctionRegistrationDate: "",
    status: "active" as "draft" | "active",
    // custom_fields (afișate pe anunț)
    price_text: "",
    location_raw: "",
    sale_type: "",
    auction_time: "",
    marca: "",
    kilometraj: "",
    combustibil: "",
    an: "",
    capacitate_cilindrica: "",
    // atribute opționale
    size: "",
    brand: "",
    color: "",
    condition: "",
  });
  const [seo, setSeo] = useState({ title: "", description: "", keywords: [] as string[] });
  const [images, setImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<Array<{ name: string; url?: string; type?: string }>>([]);
  const [customFieldsRaw, setCustomFieldsRaw] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeSection, setActiveSection] = useState("basics");

  useEffect(() => {
    if (!showModal || !editingProductId) return;
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    (async () => {
      try {
        const { data: product, error } = await supabase
          .from("products")
          .select("*")
          .eq("id", editingProductId)
          .single();
        if (cancelled) return;
        if (error || !product) {
          setMessage({ type: "error", text: "Produsul nu a putut fi încărcat." });
          setLoading(false);
          return;
        }
        const cf = (product.custom_fields && typeof product.custom_fields === "object") ? product.custom_fields as Record<string, unknown> : {};
        const ad = product.auction_date ?? "";
        const datePart = ad.includes("T") ? ad.slice(0, 10) : ad;
        const timePart = ad.includes("T") ? ad.slice(11, 16) : "";

        setForm({
          title: product.title ?? "",
          description: product.description ?? "",
          category: product.category ?? "",
          subcategory: product.subcategory ?? "",
          categoryLevel3: product.category_level_3 ?? "",
          sku: product.sku ?? "",
          currency: (product.currency as "RON" | "EUR") || "RON",
          priceRon: roundTo(Number(product.starting_price_ron ?? product.starting_price ?? 0)),
          priceEur: roundTo(Number(product.starting_price_eur ?? 0)),
          county: product.county ?? "",
          city: product.city ?? "",
          address: product.address ?? "",
          productLocation: product.product_location ?? "",
          auctionLocation: product.auction_location ?? "",
          auctionDate: datePart,
          auctionTime: timePart,
          auctionRegistrationDate: product.auction_registration_date ?? "",
          status: (product.status as "draft" | "active") || "active",
          price_text: (cf.price_text as string) ?? "",
          location_raw: (cf.location_raw as string) ?? "",
          sale_type: (cf.sale_type as string) ?? "",
          auction_time: (cf.auction_time as string) ?? "",
          marca: (cf.marca as string) ?? "",
          kilometraj: (cf.kilometraj as string) ?? "",
          combustibil: (cf.combustibil as string) ?? "",
          an: (cf.an as string) ?? "",
          capacitate_cilindrica: (cf.capacitate_cilindrica as string) ?? "",
          size: product.size ?? "",
          brand: product.brand ?? "",
          color: product.color ?? "",
          condition: product.condition ?? "",
        });
        const seoRaw = product.seo;
        setSeo({
          title: seoRaw?.title ?? "",
          description: seoRaw?.description ?? "",
          keywords: Array.isArray(seoRaw?.keywords) ? seoRaw.keywords : [],
        });
        setImages(Array.isArray(product.images) ? product.images : []);
        setDocuments(Array.isArray(product.documents) ? product.documents : []);
        setCustomFieldsRaw(cf);
      } catch {
        if (!cancelled) setMessage({ type: "error", text: "Eroare la încărcare." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showModal, editingProductId]);

  const updateForm = (key: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProductId) return;
    setSaving(true);
    setMessage(null);
    try {
      const custom_fields = {
        ...customFieldsRaw,
        price_text: form.price_text || undefined,
        location_raw: form.location_raw || undefined,
        sale_type: form.sale_type || undefined,
        auction_time: form.auction_time || undefined,
        marca: form.marca || undefined,
        kilometraj: form.kilometraj || undefined,
        combustibil: form.combustibil || undefined,
        an: form.an || undefined,
        capacitate_cilindrica: form.capacitate_cilindrica || undefined,
      };
      const auctionDate = buildAuctionDate(form.auctionDate || null, form.auctionTime || null);

      const { error } = await supabase
        .from("products")
        .update({
          title: form.title.trim() || undefined,
          description: form.description.trim() || undefined,
          category: form.category || null,
          subcategory: form.subcategory || null,
          category_level_3: form.categoryLevel3 || null,
          size: form.size || null,
          brand: form.brand || null,
          color: form.color || null,
          condition: form.condition || null,
          sku: form.sku || null,
          starting_price: form.priceRon,
          starting_price_ron: form.priceRon,
          starting_price_eur: roundTo(form.priceEur),
          currency: form.currency,
          county: form.county || null,
          city: form.city || null,
          address: form.address || null,
          product_location: form.productLocation || null,
          auction_location: form.auctionLocation || null,
          auction_date: auctionDate,
          auction_registration_date: form.auctionRegistrationDate || null,
          images: images.length ? images : [],
          documents: documents.length ? documents : [],
          custom_fields,
          seo: {
            title: (seo?.title ?? "").trim(),
            description: (seo?.description ?? "").trim(),
            keywords: Array.isArray(seo?.keywords) ? seo.keywords : [],
          },
          status: form.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingProductId);

      if (error) throw error;
      setMessage({ type: "success", text: "Anunț actualizat cu succes!" });
      onProductAdded?.();
      setTimeout(() => { setShowModal(false); setMessage(null); }, 1500);
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message ?? "Eroare la salvare. Încearcă din nou." });
    } finally {
      setSaving(false);
    }
  };

  if (!showModal) return null;

  const keywordsValue = (seo?.keywords ?? []).join(", ");
  const subcats = form.category ? (SUBCATEGORIES[form.category] ?? []) : [];

  const sectionClass = "border-b border-gray-200 last:border-0";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4 bg-black/20"
      onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl shadow-2xl bg-white border border-gray-200 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Editează anunț (toate câmpurile)</h2>
          <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Închide">
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        <div className="flex overflow-hidden flex-1 min-h-0">
          <nav className="w-48 shrink-0 border-r border-gray-200 bg-gray-50 p-2 flex flex-col gap-0.5 overflow-y-auto">
            {(["basics", "category", "price", "location", "auction", "custom", "seo", "media"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveSection(s)}
                className={`text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  activeSection === s ? "bg-emerald-100 text-emerald-800" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {s === "basics" && "Titlu & Descriere"}
                {s === "category" && "Categorie"}
                {s === "price" && "Preț"}
                {s === "location" && "Locație"}
                {s === "auction" && "Licitație"}
                {s === "custom" && "Detalii anunț"}
                {s === "seo" && "SEO"}
                {s === "media" && "Imagini & Doc"}
              </button>
            ))}
          </nav>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                <i className="ri-loader-4-line animate-spin text-3xl mr-2" /> Se încarcă…
              </div>
            ) : (
              <div className="space-y-6">
                {activeSection === "basics" && (
                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Titlu și descriere</h3>
                    <div className="space-y-3">
                      <div>
                        <label className={labelClass}>Titlu</label>
                        <input type="text" value={form.title} onChange={(e) => updateForm("title", e.target.value)} className={inputClass} placeholder="Titlu anunț" />
                      </div>
                      <div>
                        <label className={labelClass}>Descriere</label>
                        <textarea value={form.description} onChange={(e) => updateForm("description", e.target.value)} rows={6} className={inputClass} placeholder="Descriere" />
                      </div>
                      <div>
                        <label className={labelClass}>Status</label>
                        <select value={form.status} onChange={(e) => updateForm("status", e.target.value)} className={inputClass}>
                          <option value="active">Activ</option>
                          <option value="draft">Ciornă</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>SKU</label>
                        <input type="text" value={form.sku} onChange={(e) => updateForm("sku", e.target.value)} className={inputClass} placeholder="SKU" />
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === "category" && (
                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Categorie</h3>
                    <div className="space-y-3">
                      <div>
                        <label className={labelClass}>Categorie</label>
                        <select value={form.category} onChange={(e) => { updateForm("category", e.target.value); updateForm("subcategory", ""); }} className={inputClass}>
                          <option value="">Selectează</option>
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Subcategorie</label>
                        <select value={form.subcategory} onChange={(e) => updateForm("subcategory", e.target.value)} className={inputClass}>
                          <option value="">Selectează</option>
                          {subcats.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Categorie nivel 3</label>
                        <input type="text" value={form.categoryLevel3} onChange={(e) => updateForm("categoryLevel3", e.target.value)} className={inputClass} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className={labelClass}>Mărime</label><input type="text" value={form.size} onChange={(e) => updateForm("size", e.target.value)} className={inputClass} /></div>
                        <div><label className={labelClass}>Marca</label><input type="text" value={form.brand} onChange={(e) => updateForm("brand", e.target.value)} className={inputClass} /></div>
                        <div><label className={labelClass}>Culoare</label><input type="text" value={form.color} onChange={(e) => updateForm("color", e.target.value)} className={inputClass} /></div>
                        <div><label className={labelClass}>Stare</label><input type="text" value={form.condition} onChange={(e) => updateForm("condition", e.target.value)} className={inputClass} /></div>
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === "price" && (
                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Preț</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Preț (Lei)</label>
                        <input type="number" min={0} step={0.01} value={form.priceRon || ""} onChange={(e) => updateForm("priceRon", parseFloat(e.target.value) || 0)} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Preț (EUR)</label>
                        <input type="number" min={0} step={0.01} value={form.priceEur || ""} onChange={(e) => updateForm("priceEur", parseFloat(e.target.value) || 0)} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Monedă</label>
                        <select value={form.currency} onChange={(e) => updateForm("currency", e.target.value)} className={inputClass}>
                          <option value="RON">Lei</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === "location" && (
                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Locație</h3>
                    <div className="space-y-3">
                      <div>
                        <label className={labelClass}>Județ</label>
                        <select value={form.county} onChange={(e) => updateForm("county", e.target.value)} className={inputClass}>
                          <option value="">Selectează</option>
                          {COUNTIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                        </select>
                      </div>
                      <div><label className={labelClass}>Oraș</label><input type="text" value={form.city} onChange={(e) => updateForm("city", e.target.value)} className={inputClass} /></div>
                      <div><label className={labelClass}>Adresă</label><input type="text" value={form.address} onChange={(e) => updateForm("address", e.target.value)} className={inputClass} /></div>
                      <div><label className={labelClass}>Locație produs</label><input type="text" value={form.productLocation} onChange={(e) => updateForm("productLocation", e.target.value)} className={inputClass} /></div>
                      <div><label className={labelClass}>Locație licitație</label><input type="text" value={form.auctionLocation} onChange={(e) => updateForm("auctionLocation", e.target.value)} className={inputClass} /></div>
                    </div>
                  </div>
                )}

                {activeSection === "auction" && (
                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Data și ora licitație</h3>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className={labelClass}>Data licitație</label><input type="date" value={form.auctionDate} onChange={(e) => updateForm("auctionDate", e.target.value)} className={inputClass} /></div>
                        <div><label className={labelClass}>Ora licitație</label><input type="time" value={form.auctionTime} onChange={(e) => updateForm("auctionTime", e.target.value)} className={inputClass} /></div>
                      </div>
                      <div><label className={labelClass}>Data înscrierii</label><input type="text" value={form.auctionRegistrationDate} onChange={(e) => updateForm("auctionRegistrationDate", e.target.value)} className={inputClass} placeholder="ex: 12.03.2025" /></div>
                    </div>
                  </div>
                )}

                {activeSection === "custom" && (
                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Detalii anunț (custom_fields)</h3>
                    <div className="space-y-3">
                      <div><label className={labelClass}>Preț (text afișat)</label><input type="text" value={form.price_text} onChange={(e) => updateForm("price_text", e.target.value)} className={inputClass} placeholder="ex: 1.200,00 EUR" /></div>
                      <div><label className={labelClass}>Locație (text)</label><input type="text" value={form.location_raw} onChange={(e) => updateForm("location_raw", e.target.value)} className={inputClass} /></div>
                      <div><label className={labelClass}>Tip vânzare</label><input type="text" value={form.sale_type} onChange={(e) => updateForm("sale_type", e.target.value)} className={inputClass} /></div>
                      <div><label className={labelClass}>Ora licitație (text)</label><input type="text" value={form.auction_time} onChange={(e) => updateForm("auction_time", e.target.value)} className={inputClass} /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className={labelClass}>Marca</label><input type="text" value={form.marca} onChange={(e) => updateForm("marca", e.target.value)} className={inputClass} /></div>
                        <div><label className={labelClass}>Kilometraj</label><input type="text" value={form.kilometraj} onChange={(e) => updateForm("kilometraj", e.target.value)} className={inputClass} /></div>
                        <div><label className={labelClass}>Combustibil</label><input type="text" value={form.combustibil} onChange={(e) => updateForm("combustibil", e.target.value)} className={inputClass} /></div>
                        <div><label className={labelClass}>An</label><input type="text" value={form.an} onChange={(e) => updateForm("an", e.target.value)} className={inputClass} /></div>
                        <div><label className={labelClass}>Capacitate cilindrică</label><input type="text" value={form.capacitate_cilindrica} onChange={(e) => updateForm("capacitate_cilindrica", e.target.value)} className={inputClass} /></div>
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === "seo" && (
                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">SEO</h3>
                    <div className="space-y-3">
                      <div>
                        <label className={labelClass}>Titlu SEO</label>
                        <input type="text" value={seo?.title ?? ""} onChange={(e) => setSeo((p) => ({ ...p, title: e.target.value }))} maxLength={65} className={inputClass} />
                        <span className="text-xs text-gray-400">{(seo?.title ?? "").length}/65</span>
                      </div>
                      <div>
                        <label className={labelClass}>Descriere SEO</label>
                        <textarea value={seo?.description ?? ""} onChange={(e) => setSeo((p) => ({ ...p, description: e.target.value }))} rows={2} maxLength={160} className={inputClass} />
                        <span className="text-xs text-gray-400">{(seo?.description ?? "").length}/160</span>
                      </div>
                      <div>
                        <label className={labelClass}>Cuvinte cheie (virgulă)</label>
                        <input type="text" value={keywordsValue} onChange={(e) => setSeo((p) => ({ ...p, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) }))} className={inputClass} placeholder="cuvant1, cuvant2" />
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === "media" && (
                  <div className={sectionClass}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Imagini și documente</h3>
                    <div className="space-y-3">
                      <div>
                        <label className={labelClass}>URL-uri imagini (unul per linie)</label>
                        <textarea value={images.join("\n")} onChange={(e) => setImages(e.target.value.split("\n").map((u) => u.trim()).filter(Boolean))} rows={4} className={inputClass} placeholder="https://..." />
                      </div>
                      <div>
                        <label className={labelClass}>Documente (JSON sau afișare)</label>
                        <p className="text-xs text-gray-500 mb-1">{documents.length} document(e). Modificările se păstrează din custom_fields la salvare.</p>
                        <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto max-h-24 overflow-y-auto">{JSON.stringify(documents, null, 2)}</pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {message && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                {message.text}
              </div>
            )}

            {!loading && (
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Anulare</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? (<><i className="ri-loader-4-line animate-spin inline-block mr-1" /> Salvez…</>) : "Salvează"}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
