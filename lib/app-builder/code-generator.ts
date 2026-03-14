/**
 * Generates a customized page.tsx for a merchant by embedding their AppSpec
 * directly into the template, eliminating the URL-param dependency.
 *
 * This replaces the Claude Code build step entirely — no LLM needed for this.
 * The template already contains all the layout logic; we just need to inject
 * the merchant's data so it works without URL params.
 */

import type { MerchantAppSpec } from './types';

export function generateCustomPageTsx(spec: MerchantAppSpec): string {
  // Build the AppSpec object that the template expects
  const appSpec = buildAppSpec(spec);
  const specJson = JSON.stringify(appSpec, null, 2);

  // We inject the spec as a const and patch parseSpec to return it
  return `'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import {
  ShoppingCart, Calendar, MapPin, MessageCircle, Star, Trophy, User,
  Home as HomeIcon, Camera, Truck, Zap, Users, ClipboardList, Bell,
  Sparkles, Plus, X, TrendingUp, CheckCircle, Lock, ArrowRight,
  Heart, Activity, Dumbbell, Timer, Flame, Film, Bookmark, Search,
  Play, Tag, Compass, Send, DollarSign, Award, ChevronRight,
  Phone, Clock, Gem, Quote, Clapperboard, Scissors, Package, Filter,
} from 'lucide-react';

// ─── MERCHANT SPEC (hardcoded at build time) ──────────────────────────────────
const MERCHANT_SPEC = ${specJson} as const;

${TEMPLATE_BODY}
`;
}

function buildAppSpec(spec: MerchantAppSpec) {
  const name = spec.businessName || 'Your App';
  const description = spec.ideaDescription || spec.scrapedData?.description || '';
  const type = spec.businessType || spec.appFormat || 'other';
  const category = spec.category || spec.businessType || '';

  const products = (spec.products || []).map(p => ({
    name: String(p.name || ''),
    price: String(p.price || ''),
    description: String(p.description || ''),
    category: String(p.category || ''),
    badge: undefined as string | undefined,
  }));

  const heroFeature = spec.coreActions?.[0] || spec.conversionGoal || '';
  const primaryActions = spec.coreActions?.slice(0, 4).map(String) || [];

  return {
    identity: {
      name,
      tagline: String(description).slice(0, 80),
      description,
      type,
      category,
    },
    brand: {
      primaryColor: spec.primaryColor || '#10F48B',
      vibe: spec.mood || 'modern',
      logoUrl: undefined as string | undefined,
      bannerUrl: spec.scrapedData?.photos?.[0],
      fontStyle: 'clean' as const,
      backgroundColor: spec.scrapedData?.backgroundColor || '#050314',
      fontFamily: undefined as string | undefined,
      secondaryColor: spec.secondaryColor,
      uiStyle: spec.uiStyle || 'bold',
    },
    audience: {
      description: spec.audienceDescription || '',
    },
    products,
    features: {
      heroFeature,
      primaryActions,
      userFlow: spec.userJourney || '',
      differentiator: '',
    },
    content: {
      welcomeMessage: `Welcome to ${name}!`,
      quickActions: [] as unknown[],
      sections: [] as unknown[],
    },
    source: {
      scrapedUrl: spec.scrapedData?.website,
      location: spec.scrapedData?.address ? { address: spec.scrapedData.address } : undefined,
    },
    meta: {
      completeness: 80,
    },
  };
}

// The template body with parseSpec replaced to use MERCHANT_SPEC
const TEMPLATE_BODY = `
// ─── Interfaces ───────────────────────────────────────────────────────────────

interface AppSpec {
  identity: { name: string; tagline: string; description: string; type: string; category: string };
  brand: {
    primaryColor: string;
    vibe: string;
    logoUrl?: string;
    bannerUrl?: string;
    fontStyle: string;
    backgroundColor?: string;
    fontFamily?: string;
    secondaryColor?: string;
    uiStyle?: string;
  };
  audience: { description: string };
  products: { name: string; price?: string; description?: string; category?: string; badge?: string }[];
  features: { heroFeature: string; primaryActions: string[]; userFlow: string; differentiator: string };
  content: {
    welcomeMessage: string;
    quickActions: { icon: string; label: string; action: string }[];
    sections: { type: string; title: string; enabled: boolean }[];
  };
  source: { scrapedUrl?: string; scrapedImages?: string[]; location?: { address: string } };
  meta: { completeness: number };
}

type LayoutType = 'food' | 'retail' | 'fitness' | 'entertainment' | 'community' | 'services';

interface CardStyleResult {
  bg: string;
  border: string;
  shadow: string;
  radius: string;
  isGradient: boolean;
}

interface LayoutProps {
  spec: AppSpec;
  color: string;
  bg: string;
  textColor: string;
  textSecondary: string;
  cardBg: string;
  cardBorder: string;
  isLight: boolean;
  openModal: (id: string) => void;
  heroCTA: { label: string; icon: React.ElementType; modalId: string };
  quickActions: Array<{ label: string; icon: React.ElementType; modalId: string }>;
  cs: CardStyleResult;
}

function getCardStyle(uiStyle: string, color: string, cardBg: string, cardBorder: string, bg: string, isLight: boolean): CardStyleResult {
  switch (uiStyle) {
    case 'glass': return { bg: \`\${color}08\`, border: \`1px solid \${color}20\`, shadow: 'none', radius: '1rem', isGradient: false };
    case 'outlined': return { bg: 'transparent', border: \`1.5px solid \${cardBorder}\`, shadow: 'none', radius: '0.75rem', isGradient: false };
    case 'gradient': return { bg: \`linear-gradient(135deg, \${color}12, \${color}04)\`, border: \`1px solid \${color}18\`, shadow: 'none', radius: '1rem', isGradient: true };
    case 'neumorphic': return {
      bg, border: 'none',
      shadow: isLight ? \`4px 4px 8px \${adjustColor(bg, -20)}44, -4px -4px 8px #FFFFFF88\` : \`4px 4px 8px #00000044, -4px -4px 8px \${adjustColor(bg, 20)}22\`,
      radius: '1rem', isGradient: false,
    };
    default: return { bg: cardBg, border: \`1px solid \${cardBorder}\`, shadow: \`0 4px 12px \${color}10\`, radius: '0.75rem', isGradient: false };
  }
}

function csProps(cs: CardStyleResult, extra?: React.CSSProperties): React.CSSProperties {
  return {
    backgroundColor: cs.isGradient ? undefined : cs.bg,
    background: cs.isGradient ? cs.bg : undefined,
    border: cs.border,
    boxShadow: cs.shadow !== 'none' ? cs.shadow : undefined,
    borderRadius: cs.radius,
    ...extra,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLightColor(hex: string): boolean {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
  } catch { return false; }
}

function adjustColor(hex: string, offset: number): string {
  try {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const clamp = (v: number) => Math.min(255, Math.max(0, v));
    return \`#\${[r, g, b].map(c => clamp(c + offset).toString(16).padStart(2, '0')).join('')}\`;
  } catch { return hex; }
}

function getLayoutForType(type: string, category: string, heroFeature: string, primaryActions: string[]): LayoutType {
  const allText = \`\${heroFeature} \${primaryActions.join(' ')} \${category}\`.toLowerCase();
  const entKeywords = ['watch', 'stream', 'discover', 'movie', 'film', 'music', 'media', 'content', 'podcast', 'show', 'entertainment'];
  const catLower = category.toLowerCase();

  switch (type) {
    case 'restaurant': case 'cafe': return 'food';
    case 'retail': return 'retail';
    case 'fitness': case 'salon': return 'fitness';
    case 'service': case 'photography': return 'services';
    case 'community': return 'community';
    case 'game':
      return 'entertainment';
    case 'tech':
      if (entKeywords.some(k => allText.includes(k))) return 'entertainment';
      return 'services';
    default: {
      if (entKeywords.some(k => allText.includes(k))) return 'entertainment';
      if (catLower.includes('game') || catLower.includes('gaming') || catLower.includes('tower') || catLower.includes('defense') || catLower.includes('siege')) return 'entertainment';
      if (catLower.includes('food') || catLower.includes('restaurant') || catLower.includes('cafe') || catLower.includes('drink')) return 'food';
      if (catLower.includes('retail') || catLower.includes('shop') || catLower.includes('store') || catLower.includes('fashion')) return 'retail';
      if (catLower.includes('fitness') || catLower.includes('gym') || catLower.includes('wellness') || catLower.includes('salon') || catLower.includes('beauty')) return 'fitness';
      if (catLower.includes('service') || catLower.includes('photo') || catLower.includes('consult') || catLower.includes('professional')) return 'services';
      return 'community';
    }
  }
}

function getHeroCTA(heroFeature: string, layoutType: LayoutType): { label: string; icon: React.ElementType; modalId: string } {
  const f = heroFeature.toLowerCase();
  if (f.includes('play') || f.includes('tower') || f.includes('defend') || f.includes('battle') || f.includes('game')) return { label: 'Play Now', icon: Play, modalId: 'menu' };
  if (f.includes('order') || f.includes('food') || f.includes('delivery')) return { label: 'Order Now', icon: ShoppingCart, modalId: 'order' };
  if (f.includes('book') || f.includes('appointment') || f.includes('class') || f.includes('schedule')) return { label: 'Book Now', icon: Calendar, modalId: 'book' };
  if (f.includes('discover') || f.includes('browse') || f.includes('explore')) return { label: 'Discover', icon: Compass, modalId: 'menu' };
  if (f.includes('watch') || f.includes('stream') || f.includes('movie') || f.includes('film')) return { label: 'Start Watching', icon: Play, modalId: 'menu' };
  if (f.includes('shop') || f.includes('buy') || f.includes('product') || f.includes('catalog')) return { label: 'Shop Now', icon: ShoppingCart, modalId: 'order' };
  if (f.includes('quote') || f.includes('estimate') || f.includes('price')) return { label: 'Get a Quote', icon: DollarSign, modalId: 'book' };
  switch (layoutType) {
    case 'food': return { label: 'Order Now', icon: ShoppingCart, modalId: 'order' };
    case 'retail': return { label: 'Shop Now', icon: ShoppingCart, modalId: 'order' };
    case 'fitness': return { label: 'Book a Class', icon: Calendar, modalId: 'book' };
    case 'entertainment': return { label: 'Play Now', icon: Play, modalId: 'menu' };
    case 'community': return { label: 'Join Now', icon: Users, modalId: 'profile' };
    case 'services': return { label: 'Get a Quote', icon: DollarSign, modalId: 'book' };
    default: return { label: 'Get Started', icon: Zap, modalId: 'menu' };
  }
}

function parseQuickActions(primaryActions: string[]): Array<{ label: string; icon: React.ElementType; modalId: string }> {
  return primaryActions.slice(0, 4).map(action => {
    const a = action.toLowerCase();
    let icon: React.ElementType = Zap;
    let modalId = 'menu';
    const rawLabel = action.length > 12 ? action.split(' ').slice(0, 2).join(' ') : action;

    if (a.includes('tower') || a.includes('place') || a.includes('build')) { icon = Zap; modalId = 'menu'; }
    else if (a.includes('order') || (a.includes('food') && !a.includes('delivery'))) { icon = ShoppingCart; modalId = 'order'; }
    else if (a.includes('book') || a.includes('appointment') || a.includes('class')) { icon = Calendar; modalId = 'book'; }
    else if (a.includes('reward') || a.includes('loyalty') || a.includes('point')) { icon = Trophy; modalId = 'rewards'; }
    else if (a.includes('upgrade') || a.includes('level') || a.includes('gold') || a.includes('shop')) { icon = ShoppingCart; modalId = 'order'; }
    else if (a.includes('wave') || a.includes('battle') || a.includes('fight') || a.includes('survive')) { icon = Flame; modalId = 'menu'; }
    else if (a.includes('message') || a.includes('chat')) { icon = MessageCircle; modalId = 'chat'; }

    return { label: rawLabel, icon, modalId };
  });
}

function getBottomNav(layoutType: LayoutType, isFood: boolean): Array<{ id: string; Icon: React.ElementType; label: string; modal: string | null }> {
  switch (layoutType) {
    case 'entertainment':
      return [
        { id: 'home', Icon: HomeIcon, label: 'Home', modal: null },
        { id: 'discover', Icon: Compass, label: 'Play', modal: 'menu' },
        { id: 'watchlist', Icon: Bookmark, label: 'Progress', modal: 'profile' },
        { id: 'profile', Icon: User, label: 'Profile', modal: 'profile' },
      ];
    case 'food':
      return [
        { id: 'home', Icon: HomeIcon, label: 'Home', modal: null },
        { id: 'menu', Icon: ClipboardList, label: 'Menu', modal: 'menu' },
        { id: 'orders', Icon: ShoppingCart, label: 'Orders', modal: 'order' },
        { id: 'profile', Icon: User, label: 'Profile', modal: 'profile' },
      ];
    case 'retail':
      return [
        { id: 'home', Icon: HomeIcon, label: 'Home', modal: null },
        { id: 'shop', Icon: Tag, label: 'Shop', modal: 'menu' },
        { id: 'cart', Icon: ShoppingCart, label: 'Cart', modal: 'order' },
        { id: 'profile', Icon: User, label: 'Profile', modal: 'profile' },
      ];
    case 'fitness':
      return [
        { id: 'home', Icon: HomeIcon, label: 'Home', modal: null },
        { id: 'classes', Icon: Calendar, label: 'Classes', modal: 'book' },
        { id: 'progress', Icon: Activity, label: 'Progress', modal: 'profile' },
        { id: 'profile', Icon: User, label: 'Profile', modal: 'profile' },
      ];
    case 'community':
      return [
        { id: 'home', Icon: HomeIcon, label: 'Home', modal: null },
        { id: 'feed', Icon: Send, label: 'Feed', modal: null },
        { id: 'events', Icon: Calendar, label: 'Events', modal: 'book' },
        { id: 'profile', Icon: User, label: 'Profile', modal: 'profile' },
      ];
    default:
      return [
        { id: 'home', Icon: HomeIcon, label: 'Home', modal: null },
        { id: 'menu', Icon: ClipboardList, label: isFood ? 'Menu' : 'Catalog', modal: 'menu' },
        { id: 'rewards', Icon: Trophy, label: 'Rewards', modal: 'rewards' },
        { id: 'profile', Icon: User, label: 'Profile', modal: 'profile' },
      ];
  }
}

// ─── TeaseModal ───────────────────────────────────────────────────────────────

interface TeaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  previewContent: React.ReactNode;
  businessName: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  completeness: number;
}

function TeaseModal({ isOpen, onClose, title, description, previewContent, businessName, primaryColor, backgroundColor, textColor, completeness }: TeaseModalProps) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;
  const isLight = isLightColor(backgroundColor);
  const subText = isLight ? '#555555' : '#9B9AAA';
  const cardBg = isLight ? adjustColor(backgroundColor, -10) : adjustColor(backgroundColor, 18);
  const cardBorder = isLight ? adjustColor(backgroundColor, -22) : adjustColor(backgroundColor, 28);
  const pct = Math.max(completeness || 0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ animation: 'fadeInBackdrop 200ms ease-out', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl" style={{ backgroundColor, color: textColor, animation: 'slideUp 200ms ease-out', boxShadow: '0 -8px 40px rgba(0,0,0,0.4)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{ backgroundColor: isLight ? '#ccc' : '#444' }} /></div>
        <div className="flex items-start justify-between px-5 pt-3 pb-1">
          <div className="flex-1 pr-4">
            <h2 className="text-xl font-bold leading-tight">{title}</h2>
            <p className="text-sm mt-1 leading-relaxed" style={{ color: subText }}>{description}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
            <X size={15} style={{ color: subText }} />
          </button>
        </div>
        <div className="mx-5 my-3 rounded-xl p-3" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold" style={{ color: primaryColor }}>Your app is {pct}% complete</span>
            <span className="text-xs" style={{ color: subText }}>{pct}/100</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: \`\${primaryColor}22\` }}>
            <div className="h-full rounded-full transition-all" style={{ width: \`\${pct}%\`, backgroundColor: primaryColor }} />
          </div>
        </div>
        <div className="mx-5 mb-4">{previewContent}</div>
        <div className="px-5 pb-3">
          <a href="https://onboarding.freedom.world/signup" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-95" style={{ backgroundColor: primaryColor, color: isLightColor(primaryColor) ? '#1A1A1A' : '#FFFFFF' }}>
            <Lock size={16} />Sign up to unlock<ArrowRight size={16} />
          </a>
          <p className="text-center text-xs mt-2" style={{ color: subText }}>⏱ Your design is saved for 24 hours</p>
        </div>
        <div className="mx-5 mb-6 rounded-2xl py-3 px-4 flex items-center justify-center gap-2" style={{ backgroundColor: \`\${primaryColor}15\`, border: \`1px solid \${primaryColor}25\` }}>
          <Users size={14} style={{ color: primaryColor }} />
          <span className="text-xs font-medium" style={{ color: primaryColor }}>Join 500+ businesses building with Freedom World</span>
        </div>
      </div>
      <style>{\`@keyframes fadeInBackdrop{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}\`}</style>
    </div>
  );
}

// ─── Preview Components ───────────────────────────────────────────────────────

function MenuPreview({ products, primaryColor, cardBg, cardBorder, textColor, subText, isFood }: { products: AppSpec['products']; primaryColor: string; cardBg: string; cardBorder: string; textColor: string; subText: string; isFood: boolean }) {
  const items = products.slice(0, 3);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: subText }}>{isFood ? 'Menu preview' : 'Items preview'}</p>
      {items.length > 0 ? items.map((p, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: \`linear-gradient(135deg, \${primaryColor}20, \${primaryColor}08)\` }}>
            <Sparkles size={18} style={{ color: primaryColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: textColor }}>{p.name}</p>
            {p.description && <p className="text-xs truncate mt-0.5" style={{ color: subText }}>{p.description}</p>}
          </div>
          {p.price && <span className="text-sm font-bold shrink-0" style={{ color: primaryColor }}>{/^\\d/.test(p.price) ? \`฿\${p.price}\` : p.price}</span>}
        </div>
      )) : (
        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
          <p className="text-sm" style={{ color: subText }}>Your items will appear here</p>
        </div>
      )}
    </div>
  );
}

function RewardsPreview({ products, primaryColor, cardBg, cardBorder, textColor, subText }: { products: AppSpec['products']; primaryColor: string; cardBg: string; cardBorder: string; textColor: string; subText: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4" style={{ background: \`linear-gradient(135deg, \${primaryColor}25, \${primaryColor}08)\`, border: \`1px solid \${primaryColor}30\` }}>
        <div className="flex items-center justify-between mb-3">
          <div><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: primaryColor }}>Loyalty Card</p><p className="font-bold text-sm mt-0.5" style={{ color: textColor }}>Earn points every session</p></div>
          <Trophy size={24} style={{ color: primaryColor }} />
        </div>
        <div className="flex gap-1.5 flex-wrap mt-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="w-7 h-7 rounded-full border-2 flex items-center justify-center" style={{ borderColor: \`\${primaryColor}50\` }}>
              {i === 0 && <Star size={12} style={{ color: primaryColor }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfilePreview({ businessName, primaryColor, cardBg, cardBorder, textColor, subText }: { businessName: string; primaryColor: string; cardBg: string; cardBorder: string; textColor: string; subText: string }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
          <p className="text-2xl font-bold" style={{ color: textColor }}>0</p>
          <p className="text-xs" style={{ color: subText }}>members</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
          <p className="text-2xl font-bold" style={{ color: textColor }}>—</p>
          <p className="text-xs" style={{ color: subText }}>analytics</p>
        </div>
      </div>
    </div>
  );
}

function OrderPreview({ businessName, primaryColor, cardBg, cardBorder, textColor, subText }: { businessName: string; primaryColor: string; cardBg: string; cardBorder: string; textColor: string; subText: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4 text-center" style={{ background: \`linear-gradient(135deg, \${primaryColor}20, \${primaryColor}05)\`, border: \`1px solid \${primaryColor}25\` }}>
        <ShoppingCart size={32} className="mx-auto mb-2" style={{ color: primaryColor }} />
        <p className="font-bold" style={{ color: textColor }}>{businessName}</p>
        <p className="text-sm mt-1" style={{ color: subText }}>In-app purchases available</p>
      </div>
    </div>
  );
}

function BookPreview({ businessName: _b, primaryColor, cardBg, cardBorder, textColor, subText }: { businessName: string; primaryColor: string; cardBg: string; cardBorder: string; textColor: string; subText: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
        <p className="text-xs font-semibold mb-3" style={{ color: textColor }}>Schedule</p>
        <div className="flex gap-2 justify-between">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => (
            <div key={d} className="flex flex-col items-center gap-1">
              <span className="text-[10px]" style={{ color: subText }}>{d}</span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium" style={i === 2 ? { backgroundColor: primaryColor, color: isLightColor(primaryColor) ? '#1A1A1A' : '#fff' } : { color: textColor }}>{10 + i}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VisitPreview({ address, primaryColor, cardBg, cardBorder, textColor, subText }: { address?: string; primaryColor: string; cardBg: string; cardBorder: string; textColor: string; subText: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden flex items-center justify-center" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\`, height: 100 }}>
        <div className="text-center"><MapPin size={28} className="mx-auto mb-1" style={{ color: primaryColor }} />{address ? <p className="text-xs px-4" style={{ color: textColor }}>{address}</p> : <p className="text-xs" style={{ color: subText }}>Location info here</p>}</div>
      </div>
    </div>
  );
}

function ChatPreview({ businessName, primaryColor, cardBg, cardBorder, textColor, subText }: { businessName: string; primaryColor: string; cardBg: string; cardBorder: string; textColor: string; subText: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: \`\${primaryColor}25\`, color: primaryColor }}>{businessName.charAt(0)}</div>
        <div className="rounded-2xl rounded-bl-sm px-3 py-2" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}><p className="text-xs" style={{ color: textColor }}>Welcome to {businessName}!</p></div>
      </div>
    </div>
  );
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

function QuickActionsGrid({ actions, color, cardBg, cardBorder, textSecondary, openModal }: { actions: Array<{ label: string; icon: React.ElementType; modalId: string }>; color: string; cardBg: string; cardBorder: string; textSecondary: string; openModal: (id: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {actions.slice(0, 4).map((qa, i) => {
        const Icon = qa.icon;
        return (
          <button key={i} onClick={() => openModal(qa.modalId)} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all active:scale-95" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: \`linear-gradient(135deg, \${color}25, \${color}10)\` }}>
              <Icon size={18} style={{ color }} />
            </div>
            <span className="text-[10px] font-medium leading-tight text-center px-1" style={{ color: textSecondary }}>{qa.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AppHeader({ spec, color, cardBg, cardBorder, textColor, textSecondary, openModal }: { spec: AppSpec; color: string; cardBg: string; cardBorder: string; textColor: string; textSecondary: string; openModal: (id: string) => void }) {
  return (
    <header className="px-5 pb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {spec.brand.logoUrl ? (
          <img src={spec.brand.logoUrl} alt={spec.identity.name} className="w-10 h-10 rounded-xl object-cover" style={{ border: \`2px solid \${cardBorder}\` }} />
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold" style={{ background: \`linear-gradient(135deg, \${color}, \${color}88)\`, color: isLightColor(color) ? '#1A1A1A' : '#FFFFFF' }}>
            {spec.identity.name.charAt(0)}
          </div>
        )}
        <div>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: textColor }}>{spec.identity.name}</h1>
          <p className="text-xs truncate max-w-[180px]" style={{ color: textSecondary }}>{spec.identity.tagline || spec.identity.description?.slice(0, 45) || \`Welcome to \${spec.identity.name}\`}</p>
        </div>
      </div>
      <button onClick={() => openModal('profile')} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
        <Bell size={16} style={{ color: textSecondary }} />
      </button>
    </header>
  );
}

// ─── Entertainment Layout (used for games) ───────────────────────────────────

function EntertainmentLayout({ spec, color, bg, textColor, textSecondary, cardBg, cardBorder, openModal, heroCTA, quickActions }: LayoutProps) {
  const { identity, products, features } = spec;
  const genres = ['All', 'Strategy', 'Action', 'Puzzle', 'RPG', 'Casual'];
  const [activeGenre, setActiveGenre] = useState('All');
  const HeroCTAIcon = heroCTA.icon;

  return (
    <div className="space-y-5">
      {/* Cinematic hero */}
      <div className="relative rounded-3xl overflow-hidden mx-5" style={{ minHeight: 220 }}>
        <div className="absolute inset-0" style={{ background: \`linear-gradient(135deg, \${adjustColor(bg, -20)} 0%, \${color}20 50%, \${adjustColor(bg, -30)})\` }} />
        <div className="absolute inset-0" style={{ background: \`radial-gradient(ellipse at 70% 30%, \${color}25, transparent 60%)\` }} />
        <div className="relative p-5 flex flex-col justify-between" style={{ minHeight: 220 }}>
          <div className="flex items-center gap-2">
            {features.differentiator && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md" style={{ backgroundColor: \`\${color}28\`, color, border: \`1px solid \${color}45\` }}>
                <Zap size={10} />{features.differentiator.length > 35 ? features.differentiator.slice(0, 35) + '…' : features.differentiator}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight" style={{ color: textColor, textShadow: \`0 0 40px \${color}40\` }}>{identity.name}</h2>
            <p className="text-sm mt-1 opacity-80 leading-relaxed" style={{ color: textColor }}>{identity.tagline || identity.description?.slice(0, 70)}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => openModal(heroCTA.modalId)} className="flex items-center gap-2 py-3.5 px-6 rounded-2xl text-sm font-bold transition-all active:scale-95" style={{ background: \`linear-gradient(135deg, \${color}, \${adjustColor(color, -30)})\`, color: isLightColor(color) ? '#1A1A1A' : '#FFFFFF', boxShadow: \`0 4px 20px \${color}60\` }}>
                <HeroCTAIcon size={16} />{heroCTA.label}
              </button>
              <button onClick={() => openModal('profile')} className="flex items-center gap-2 py-3.5 px-4 rounded-2xl text-sm font-semibold transition-all active:scale-95" style={{ backgroundColor: cardBg, color: textColor, border: \`1px solid \${cardBorder}\` }}>
                <Trophy size={15} /> Leaderboard
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-5">
        {/* Quick Actions */}
        <QuickActionsGrid actions={quickActions} color={color} cardBg={cardBg} cardBorder={cardBorder} textSecondary={textSecondary} openModal={openModal} />

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
          {genres.map(g => (
            <button key={g} onClick={() => setActiveGenre(g)} className="px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95" style={activeGenre === g ? { background: \`linear-gradient(135deg, \${color}, \${adjustColor(color, -30)})\`, color: isLightColor(color) ? '#1A1A1A' : '#FFFFFF' } : { backgroundColor: cardBg, color: textSecondary, border: \`1px solid \${cardBorder}\` }}>
              {g}
            </button>
          ))}
        </div>

        {/* Products / Towers grid */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold flex items-center gap-1.5" style={{ color: textColor }}><Zap size={14} style={{ color }} /> {products.length > 0 ? 'Available ' + (identity.category === 'game' ? 'Towers' : 'Items') : 'Featured'}</h3>
            <button className="text-xs font-semibold flex items-center gap-0.5" style={{ color }} onClick={() => openModal('order')}>Unlock all <ChevronRight size={12} /></button>
          </div>
          {products.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {products.slice(0, 4).map((product, i) => (
                <button key={i} onClick={() => openModal('order')} className="rounded-2xl overflow-hidden text-left transition-all active:scale-95" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
                  <div className="h-24 flex items-center justify-center relative" style={{ background: \`linear-gradient(135deg, \${color}20, \${color}06)\` }}>
                    <span className="text-4xl">{['🏹', '💣', '✨', '⚡', '🔥', '❄️'][i % 6]}</span>
                    {i === 0 && <span className="absolute top-2 left-2 text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: color, color: isLightColor(color) ? '#1A1A1A' : '#FFFFFF' }}>Starter</span>}
                  </div>
                  <div className="p-2.5">
                    <p className="font-bold text-xs" style={{ color: textColor }}>{product.name}</p>
                    {product.description && <p className="text-[10px] mt-0.5 truncate" style={{ color: textSecondary }}>{product.description}</p>}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs font-bold" style={{ color }}>{product.price ? \`\${product.price} gold\` : 'Free'}</span>
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: \`\${color}25\` }}>
                        <Plus size={12} style={{ color }} />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
              <span className="text-4xl">🏰</span>
              <p className="text-sm mt-2 font-semibold" style={{ color: textColor }}>Defend your kingdom</p>
              <p className="text-xs mt-1" style={{ color: textSecondary }}>Place towers to stop enemy waves</p>
            </div>
          )}
        </section>

        {/* Leaderboard teaser */}
        <section>
          <h3 className="text-base font-bold mb-3 flex items-center gap-1.5" style={{ color: textColor }}><Trophy size={14} style={{ color }} /> Top Players</h3>
          <div className="space-y-2">
            {[{ rank: 1, name: 'DragonSlayer', score: '99,820', medal: '🥇' }, { rank: 2, name: 'TowerMaster', score: '87,450', medal: '🥈' }, { rank: 3, name: 'DefendKing', score: '76,200', medal: '🥉' }].map((player, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-2xl" style={{ backgroundColor: i === 0 ? \`\${color}15\` : cardBg, border: \`1px solid \${i === 0 ? color + '35' : cardBorder}\` }}>
                <span className="text-xl">{player.medal}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: textColor }}>{player.name}</p>
                  <p className="text-xs" style={{ color: textSecondary }}>Score: {player.score}</p>
                </div>
                <ChevronRight size={14} style={{ color: textSecondary }} />
              </div>
            ))}
          </div>
        </section>

        {/* Daily challenge */}
        <section>
          <button onClick={() => openModal('rewards')} className="w-full rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.99]" style={{ background: \`linear-gradient(135deg, \${color}20, \${color}08)\`, border: \`1px solid \${color}30\` }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: \`linear-gradient(135deg, \${color}35, \${color}10)\` }}>⚔️</div>
            <div className="flex-1 text-left">
              <p className="font-bold text-sm" style={{ color: textColor }}>Daily Challenge</p>
              <p className="text-xs mt-0.5" style={{ color: textSecondary }}>Survive 10 waves · Reward: 500 gold</p>
            </div>
            <Flame size={18} style={{ color }} />
          </button>
        </section>
      </div>
    </div>
  );
}

// ─── Other Layout Stubs ───────────────────────────────────────────────────────

function FoodLayout({ spec, color, bg, textColor, textSecondary, cardBg, cardBorder, openModal, heroCTA, quickActions }: LayoutProps) {
  const { identity, products, features } = spec;
  const HeroCTAIcon = heroCTA.icon;
  return (
    <div className="space-y-5">
      <div className="relative rounded-3xl overflow-hidden mx-5" style={{ minHeight: 190 }}>
        <div className="absolute inset-0" style={{ background: spec.brand.bannerUrl ? \`url(\${spec.brand.bannerUrl}) center/cover\` : \`linear-gradient(135deg, \${color}30 0%, \${adjustColor(color, -40)}20 50%, \${bg})\` }} />
        <div className="absolute inset-0" style={{ background: \`linear-gradient(to bottom, transparent 30%, \${bg} 95%)\` }} />
        <div className="relative p-5 flex flex-col justify-end" style={{ minHeight: 190 }}>
          <h2 className="text-2xl font-extrabold" style={{ color: textColor }}>{identity.name}</h2>
          <p className="text-sm mt-1 opacity-75" style={{ color: textColor }}>{identity.tagline || identity.description?.slice(0, 60)}</p>
          <button onClick={() => openModal(heroCTA.modalId)} className="mt-4 flex items-center gap-2 py-3.5 px-6 rounded-2xl text-sm font-bold self-start active:scale-95" style={{ background: \`linear-gradient(135deg, \${color}, \${adjustColor(color, -30)})\`, color: isLightColor(color) ? '#1A1A1A' : '#FFFFFF' }}>
            <HeroCTAIcon size={16} />{heroCTA.label}
          </button>
        </div>
      </div>
      <div className="px-5 space-y-4">
        <QuickActionsGrid actions={quickActions} color={color} cardBg={cardBg} cardBorder={cardBorder} textSecondary={textSecondary} openModal={openModal} />
        <section>
          <h3 className="text-base font-bold mb-3" style={{ color: textColor }}>Menu</h3>
          <div className="grid grid-cols-2 gap-3">
            {(products.length > 0 ? products : []).slice(0, 4).map((p, i) => (
              <button key={i} onClick={() => openModal('order')} className="rounded-2xl p-3 text-left active:scale-95" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
                <div className="h-20 rounded-xl mb-2 flex items-center justify-center" style={{ background: \`linear-gradient(135deg, \${color}18, \${color}06)\` }}>
                  <span className="text-3xl">{['🍜','🥗','🍱','🥩'][i%4]}</span>
                </div>
                <p className="font-semibold text-xs" style={{ color: textColor }}>{p.name}</p>
                <p className="text-xs font-bold mt-1" style={{ color }}>{p.price ? (/^\\d/.test(p.price) ? \`฿\${p.price}\` : p.price) : 'View'}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RetailLayout({ spec, color, bg, textColor, textSecondary, cardBg, cardBorder, openModal, heroCTA, quickActions }: LayoutProps) {
  const { identity, products } = spec;
  const HeroCTAIcon = heroCTA.icon;
  return (
    <div className="space-y-5">
      <div className="relative rounded-3xl overflow-hidden mx-5" style={{ minHeight: 185 }}>
        <div className="absolute inset-0" style={{ background: \`linear-gradient(135deg, \${color}25, \${adjustColor(color, 50)}15 60%, \${bg})\` }} />
        <div className="absolute inset-0" style={{ background: \`linear-gradient(to bottom, transparent 20%, \${bg} 100%)\` }} />
        <div className="relative p-5 flex flex-col justify-end" style={{ minHeight: 185 }}>
          <h2 className="text-2xl font-extrabold" style={{ color: textColor }}>{identity.name}</h2>
          <p className="text-sm mt-1 opacity-75" style={{ color: textColor }}>{identity.tagline || identity.description?.slice(0, 60)}</p>
          <button onClick={() => openModal(heroCTA.modalId)} className="mt-4 flex items-center gap-2 py-3 px-5 rounded-2xl text-sm font-bold self-start active:scale-95" style={{ background: \`linear-gradient(135deg, \${color}, \${adjustColor(color, -30)})\`, color: isLightColor(color) ? '#1A1A1A' : '#FFFFFF' }}>
            <HeroCTAIcon size={15} />{heroCTA.label}
          </button>
        </div>
      </div>
      <div className="px-5 space-y-4">
        <QuickActionsGrid actions={quickActions} color={color} cardBg={cardBg} cardBorder={cardBorder} textSecondary={textSecondary} openModal={openModal} />
        <section>
          <h3 className="text-base font-bold mb-3" style={{ color: textColor }}>Products</h3>
          <div className="grid grid-cols-2 gap-3">
            {products.slice(0, 4).map((p, i) => (
              <button key={i} onClick={() => openModal('order')} className="rounded-2xl overflow-hidden active:scale-95" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
                <div className="h-24 flex items-center justify-center" style={{ background: \`linear-gradient(135deg, \${color}15, \${color}05)\` }}>
                  <span className="text-3xl">{['👗','👟','👜','⌚'][i%4]}</span>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-semibold" style={{ color: textColor }}>{p.name}</p>
                  <p className="text-xs font-bold mt-1" style={{ color }}>{p.price || '—'}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function FitnessLayout({ spec, color, bg, textColor, textSecondary, cardBg, cardBorder, openModal, heroCTA, quickActions }: LayoutProps) {
  const { identity } = spec;
  const HeroCTAIcon = heroCTA.icon;
  return (
    <div className="space-y-5">
      <div className="relative rounded-3xl overflow-hidden mx-5" style={{ minHeight: 195 }}>
        <div className="absolute inset-0" style={{ background: \`linear-gradient(135deg, \${color}35 0%, \${adjustColor(color, -60)}20 60%, \${bg})\` }} />
        <div className="absolute inset-0" style={{ background: \`linear-gradient(to bottom, transparent 30%, \${bg} 95%)\` }} />
        <div className="relative p-5 flex flex-col justify-end" style={{ minHeight: 195 }}>
          <h2 className="text-2xl font-extrabold" style={{ color: textColor }}>{identity.name}</h2>
          <p className="text-sm mt-1 opacity-75" style={{ color: textColor }}>{identity.tagline || identity.description?.slice(0, 60)}</p>
          <button onClick={() => openModal(heroCTA.modalId)} className="mt-4 flex items-center gap-2 py-3.5 px-6 rounded-2xl text-sm font-bold self-start active:scale-95" style={{ background: \`linear-gradient(135deg, \${color}, \${adjustColor(color, -30)})\`, color: isLightColor(color) ? '#1A1A1A' : '#FFFFFF' }}>
            <HeroCTAIcon size={16} />{heroCTA.label}
          </button>
        </div>
      </div>
      <div className="px-5">
        <QuickActionsGrid actions={quickActions} color={color} cardBg={cardBg} cardBorder={cardBorder} textSecondary={textSecondary} openModal={openModal} />
      </div>
    </div>
  );
}

function CommunityLayout({ spec, color, bg, textColor, textSecondary, cardBg, cardBorder, openModal, heroCTA, quickActions }: LayoutProps) {
  const { identity } = spec;
  const HeroCTAIcon = heroCTA.icon;
  return (
    <div className="space-y-5">
      <div className="relative rounded-3xl overflow-hidden mx-5" style={{ minHeight: 185 }}>
        <div className="absolute inset-0" style={{ background: \`linear-gradient(135deg, \${color}25, \${bg})\` }} />
        <div className="absolute inset-0" style={{ background: \`linear-gradient(to bottom, transparent 25%, \${bg} 100%)\` }} />
        <div className="relative p-5 flex flex-col justify-end" style={{ minHeight: 185 }}>
          <h2 className="text-2xl font-extrabold" style={{ color: textColor }}>{identity.name}</h2>
          <p className="text-sm mt-1 opacity-75" style={{ color: textColor }}>{identity.tagline || identity.description?.slice(0, 60)}</p>
          <button onClick={() => openModal(heroCTA.modalId)} className="mt-4 flex items-center gap-2 py-3 px-5 rounded-2xl text-sm font-bold self-start active:scale-95" style={{ background: \`linear-gradient(135deg, \${color}, \${adjustColor(color, -30)})\`, color: isLightColor(color) ? '#1A1A1A' : '#FFFFFF' }}>
            <HeroCTAIcon size={16} />{heroCTA.label}
          </button>
        </div>
      </div>
      <div className="px-5">
        <QuickActionsGrid actions={quickActions} color={color} cardBg={cardBg} cardBorder={cardBorder} textSecondary={textSecondary} openModal={openModal} />
      </div>
    </div>
  );
}

function ServicesLayout({ spec, color, bg, textColor, textSecondary, cardBg, cardBorder, openModal, heroCTA, quickActions }: LayoutProps) {
  const { identity, products } = spec;
  const HeroCTAIcon = heroCTA.icon;
  return (
    <div className="space-y-5">
      <div className="relative rounded-3xl overflow-hidden mx-5" style={{ minHeight: 190 }}>
        <div className="absolute inset-0" style={{ background: \`linear-gradient(135deg, \${color}28 0%, \${bg})\` }} />
        <div className="absolute inset-0" style={{ background: \`linear-gradient(to bottom, transparent 20%, \${bg} 95%)\` }} />
        <div className="relative p-5 flex flex-col justify-end" style={{ minHeight: 190 }}>
          <h2 className="text-2xl font-extrabold" style={{ color: textColor }}>{identity.name}</h2>
          <p className="text-sm mt-1 opacity-75" style={{ color: textColor }}>{identity.tagline || identity.description?.slice(0, 60)}</p>
          <button onClick={() => openModal(heroCTA.modalId)} className="mt-4 flex items-center gap-2 py-3 px-5 rounded-2xl text-sm font-bold self-start active:scale-95" style={{ background: \`linear-gradient(135deg, \${color}, \${adjustColor(color, -30)})\`, color: isLightColor(color) ? '#1A1A1A' : '#FFFFFF' }}>
            <HeroCTAIcon size={15} />{heroCTA.label}
          </button>
        </div>
      </div>
      <div className="px-5 space-y-4">
        <QuickActionsGrid actions={quickActions} color={color} cardBg={cardBg} cardBorder={cardBorder} textSecondary={textSecondary} openModal={openModal} />
        {products.length > 0 && (
          <section>
            <h3 className="text-base font-bold mb-3" style={{ color: textColor }}>Services</h3>
            <div className="space-y-2">
              {products.slice(0, 3).map((p, i) => (
                <button key={i} onClick={() => openModal('book')} className="w-full flex items-center gap-3 p-3 rounded-2xl active:scale-[0.99]" style={{ backgroundColor: cardBg, border: \`1px solid \${cardBorder}\` }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: \`linear-gradient(135deg, \${color}25, \${color}08)\` }}>
                    <Sparkles size={16} style={{ color }} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: textColor }}>{p.name}</p>
                    {p.description && <p className="text-xs" style={{ color: textSecondary }}>{p.description}</p>}
                  </div>
                  <span className="text-xs font-bold" style={{ color }}>{p.price || '—'}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function AppContent() {
  // Use hardcoded MERCHANT_SPEC instead of URL params
  const spec = MERCHANT_SPEC as AppSpec;
  const [activeTab, setActiveTab] = useState('home');
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const { identity, brand, products, features, source } = spec;

  const color = brand.primaryColor || '#10F48B';
  const bg = brand.backgroundColor || '#050314';
  const isLight = isLightColor(bg);
  const textColor = isLight ? '#1A1A1A' : '#FFFFFF';
  const textSecondary = isLight ? '#666666' : '#8B8A9A';
  const cardBg = isLight ? adjustColor(bg, -12) : adjustColor(bg, 15);
  const cardBorder = isLight ? adjustColor(bg, -25) : adjustColor(bg, 25);
  const fontFamilyStyle = brand.fontFamily ? \`"\${brand.fontFamily}", -apple-system, sans-serif\` : "'Inter', -apple-system, sans-serif";
  const completeness = spec.meta?.completeness || 80;
  const businessName = identity.name;
  const cs = getCardStyle(brand.uiStyle || 'bold', color, cardBg, cardBorder, bg, isLight);

  const layoutType = getLayoutForType(identity.type, identity.category, features.heroFeature, features.primaryActions);
  const isFood = layoutType === 'food';
  const heroCTA = getHeroCTA(features.heroFeature, layoutType);

  const defaultActionsByType: Record<string, Array<{ label: string; icon: React.ElementType; modalId: string }>> = {
    food: [{ label: 'Order', icon: ShoppingCart, modalId: 'order' }, { label: 'Book Table', icon: Calendar, modalId: 'book' }, { label: 'Delivery', icon: Truck, modalId: 'order' }, { label: 'Pickup', icon: MapPin, modalId: 'visit' }],
    retail: [{ label: 'Browse', icon: Compass, modalId: 'menu' }, { label: 'Cart', icon: ShoppingCart, modalId: 'order' }, { label: 'Wishlist', icon: Heart, modalId: 'menu' }, { label: 'Track', icon: Package, modalId: 'order' }],
    fitness: [{ label: 'Book Class', icon: Calendar, modalId: 'book' }, { label: 'Schedule', icon: ClipboardList, modalId: 'book' }, { label: 'Progress', icon: Activity, modalId: 'profile' }, { label: 'Community', icon: Users, modalId: 'profile' }],
    entertainment: [{ label: 'Play', icon: Play, modalId: 'menu' }, { label: 'Towers', icon: Zap, modalId: 'menu' }, { label: 'Upgrade', icon: TrendingUp, modalId: 'order' }, { label: 'Leaderboard', icon: Trophy, modalId: 'rewards' }],
    community: [{ label: 'Post', icon: Send, modalId: 'chat' }, { label: 'Events', icon: Calendar, modalId: 'book' }, { label: 'Members', icon: Users, modalId: 'profile' }, { label: 'Chat', icon: MessageCircle, modalId: 'chat' }],
    services: [{ label: 'Book', icon: Calendar, modalId: 'book' }, { label: 'Get Quote', icon: DollarSign, modalId: 'book' }, { label: 'Portfolio', icon: Camera, modalId: 'menu' }, { label: 'Reviews', icon: Star, modalId: 'menu' }],
  };
  const quickActions = features.primaryActions.length >= 2
    ? parseQuickActions(features.primaryActions)
    : (defaultActionsByType[layoutType] || defaultActionsByType.entertainment);

  const openModal = (id: string) => setActiveModal(id);
  const closeModal = () => setActiveModal(null);

  const previewProps = { primaryColor: color, cardBg, cardBorder, textColor, subText: textSecondary };

  const modals: Record<string, { title: string; description: string; preview: React.ReactNode }> = {
    menu: { title: \`\${businessName} — Game Features\`, description: 'Unlock all towers, maps, and game modes.', preview: <MenuPreview products={products} isFood={isFood} {...previewProps} /> },
    rewards: { title: 'Daily Rewards & Achievements', description: 'Complete challenges to earn gold and unlock special towers.', preview: <RewardsPreview products={products} {...previewProps} /> },
    profile: { title: 'Your Profile & Progress', description: 'Track your game stats and achievements.', preview: <ProfilePreview businessName={businessName} {...previewProps} /> },
    order: { title: 'In-App Shop', description: 'Unlock premium towers and power-ups.', preview: <OrderPreview businessName={businessName} {...previewProps} /> },
    book: { title: 'Schedule & Events', description: 'Join tournaments and special events.', preview: <BookPreview businessName={businessName} {...previewProps} /> },
    visit: { title: 'Find Us', description: 'Connect with the community.', preview: <VisitPreview address={source.location?.address} {...previewProps} /> },
    chat: { title: 'Community Chat', description: 'Connect with other players.', preview: <ChatPreview businessName={businessName} {...previewProps} /> },
  };

  const currentModal = activeModal ? modals[activeModal] : null;
  const bottomNav = getBottomNav(layoutType, isFood);

  const layoutProps: LayoutProps = { spec, color, bg, textColor, textSecondary, cardBg, cardBorder, isLight, openModal, heroCTA, quickActions, cs };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: bg, color: textColor, fontFamily: fontFamilyStyle }}>
      <div className="h-12 shrink-0" />
      <AppHeader spec={spec} color={color} cardBg={cardBg} cardBorder={cardBorder} textColor={textColor} textSecondary={textSecondary} openModal={openModal} />
      <main className="flex-1 overflow-y-auto pb-28">
        {layoutType === 'food' && <FoodLayout {...layoutProps} />}
        {layoutType === 'retail' && <RetailLayout {...layoutProps} />}
        {layoutType === 'fitness' && <FitnessLayout {...layoutProps} />}
        {layoutType === 'entertainment' && <EntertainmentLayout {...layoutProps} />}
        {layoutType === 'community' && <CommunityLayout {...layoutProps} />}
        {layoutType === 'services' && <ServicesLayout {...layoutProps} />}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 backdrop-blur-xl border-t px-2 pb-6 pt-2" style={{ backgroundColor: \`\${bg}ee\`, borderColor: cardBorder }}>
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {bottomNav.map((tab) => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.modal) openModal(tab.modal); }} className="flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all active:scale-95" style={{ color: activeTab === tab.id ? color : textSecondary }}>
              <tab.Icon size={20} />
              <span className="text-[10px] font-medium">{tab.label}</span>
              {activeTab === tab.id && <div className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: color }} />}
            </button>
          ))}
        </div>
      </nav>
      {currentModal && (
        <TeaseModal isOpen={activeModal !== null} onClose={closeModal} title={currentModal.title} description={currentModal.description} previewContent={currentModal.preview} businessName={businessName} primaryColor={color} backgroundColor={bg} textColor={textColor} completeness={completeness} />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#050314', color: '#fff' }}>
        <div className="animate-pulse text-center">
          <Sparkles size={32} className="mx-auto mb-2 opacity-60" />
          <p className="text-sm opacity-60">Loading {MERCHANT_SPEC.identity.name}...</p>
        </div>
      </div>
    }>
      <AppContent />
    </Suspense>
  );
}
`;
