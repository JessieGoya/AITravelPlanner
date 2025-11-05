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
    <div className="row">
      <button className="btn" onClick={listening ? stop : start}>
        {listening ? '停止录音' : '开始语音输入'}
      </button>
    </div>
  );
}


