import React from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, FileText, Info, List, LoaderCircle, Map as MapIcon,
  MapPin, Maximize, Menu, Minus, Plus, RotateCcw, Rss, Search, SearchX, ShieldCheck, X,
} from 'lucide-react';

// Only icons that are actually used are imported, so the bundle stays small.
const ICONS = {
  ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, FileText, Info, List, LoaderCircle, Map: MapIcon,
  MapPin, Maximize, Menu, Minus, Plus, RotateCcw, Rss, Search, SearchX, ShieldCheck, X,
};

export function Icon({ name, size = 16, className = '' }) {
  const Component = ICONS[name];
  if (!Component) throw new Error(`Unknown icon: ${name}`);
  return <Component className={`icon ${className}`.trim()} size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}
