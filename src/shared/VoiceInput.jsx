import { useEffect, useRef, useState } from 'react';

export default function VoiceInput({ onText }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  useEffect(() => {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join('');
      if (text) onText(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
  }, [onText]);

  const start = () => {
    if (!recRef.current) {
      alert('当前浏览器不支持 Web 语音识别，您可直接输入文字');
      return;
    }
    setListening(true);
    recRef.current.start();
  };

  const stop = () => {
    try { recRef.current?.stop?.(); } catch {}
    setListening(false);
  };

  return (
    <div className="row" style={{ alignItems: 'center', gap: 8 }}>
      <button 
        className="btn" 
        onClick={listening ? stop : start}
        style={{ 
          background: listening ? 'rgba(239, 68, 68, 0.2)' : undefined,
          borderColor: listening ? 'rgba(239, 68, 68, 0.5)' : undefined,
          animation: listening ? 'pulse 1.5s ease-in-out infinite' : undefined
        }}
      >
        {listening ? '🛑 停止录音' : '🎤 开始语音输入'}
      </button>
      {listening && (
        <span className="muted" style={{ fontSize: '12px' }}>
          正在录音...
        </span>
      )}
    </div>
  );
}


