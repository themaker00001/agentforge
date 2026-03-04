import React from 'react';
import {
    Bot, Link, Zap, Scale, Target, Split, Pin, Repeat, StickyNote,
    Search, Settings, Globe, Folder, Calculator, Braces, BarChart,
    Scissors, Clock, Terminal, Library, FileText, MessageSquare,
    Paperclip, Anchor, Image, Send, LayoutTemplate
} from 'lucide-react';

const ICON_MAP = {
    'agent': Bot,
    'chain': Link,
    'react': Zap,
    'debate': Scale,
    'evaluator': Target,
    'condition': Split,
    'set_variable': Pin,
    'parallel': Zap,
    'merge': Link,
    'loop': Repeat,
    'note': StickyNote,
    'web_search': Search,
    'tool': Settings,
    'http_request': Globe,
    'file_reader': Folder,
    'calculator': Calculator,
    'json_parse': Braces,
    'csv_reader': BarChart,
    'text_splitter': Scissors,
    'date_time': Clock,
    'shell_exec': Terminal,
    'file_system': Folder,
    'powerbi': BarChart,
    'knowledge': Library,
    'doc_loader': FileText,
    'input': MessageSquare,
    'file_input': Paperclip,
    'webhook': Anchor,
    'media_input': Image,
    'output': Send,
    'template': LayoutTemplate
};

export default function NodeIcon({ type, fallback = Settings, ...props }) {
    const IconComponent = ICON_MAP[type] || fallback;
    return <IconComponent {...props} />;
}
