import React from 'react';
import {
  ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Ellipsis, ExternalLink, FileText, Info, KeyRound, List,
  LoaderCircle, Lock, LockOpen, LogOut, Map as MapIcon, MapPin, Maximize, Menu, Minus, Plus, RotateCcw, Rss, Search, SearchX,
  ShieldCheck, Trash2, User, UserRound, Users, X,
} from 'lucide-react';

// Only icons that are actually used are imported, so the bundle stays small.
const ICONS = {
  ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Ellipsis, ExternalLink, FileText, Info, KeyRound, List,
  LoaderCircle, Lock, LockOpen, LogOut, Map: MapIcon, MapPin, Maximize, Menu, Minus, Plus, RotateCcw, Rss, Search, SearchX,
  ShieldCheck, Trash2, User, UserRound, Users, X,
};

export function Icon({ name, size = 16, className = '' }) {
  const Component = ICONS[name];
  if (!Component) throw new Error(`Unknown icon: ${name}`);
  return <Component className={`icon ${className}`.trim()} size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}
