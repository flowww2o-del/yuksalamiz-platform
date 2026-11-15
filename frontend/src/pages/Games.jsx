import React from 'react';
import { ArrowLeft, Brain, LayoutGrid, Zap } from 'lucide-react';
import { hasTgBack } from '../api';

const GAMES = [
  { icon: LayoutGrid, name: '2048', text: "Raqamlarni birlashtiring", tone: 'blue' },
  { icon: Zap, name: 'Snake', text: 'Klassik ilon o\'yini', tone: 'green' },
  { icon: Brain, name: 'Blocks', text: 'Bloklarni joylashtiring', tone: 'purple' },
];

export default function Games({ back }) {
  return (
    <>
      {!hasTgBack && <button className="back-link" onClick={back}><ArrowLeft size={16} /> Orqaga</button>}
      <div className="page-title"><h1>Mini o'yinlar</h1><p>Bilimingizni sinang va Drop yutib oling</p></div>
      <div className="list card">
        {GAMES.map(({ icon: Icon, name, text, tone }) => (
          <div key={name} className="list-row">
            <div className={`tile-icon ${tone}`}><Icon size={20} /></div>
            <div className="list-main"><b>{name}</b><small>{text}</small></div>
            <span className="badge">Tez orada</span>
          </div>
        ))}
      </div>
    </>
  );
}
