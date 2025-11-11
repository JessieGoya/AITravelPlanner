import { useEffect, useRef, useState } from 'react';

// 智能添加标点符号的函数
function addPunctuation(text) {
  if (!text || !text.trim()) return text;
  
  let result = text.trim();
  
  // 移除末尾可能存在的标点符号（后面会重新添加）
  result = result.replace(/[。！？，、；：]+$/g, '');
  
  // 1. 在时间单位（天、日、月、年等）后、其他关键词前添加逗号
  // 例如："5天预算" -> "5天，预算"、"3天喜欢" -> "3天，喜欢"
  result = result.replace(/(\d+[天日月年个周])([^\d，。！？、；：]{2,})/g, '$1，$2');
  
  // 2. 在金额单位后、非数字内容前添加逗号
  // 例如："1万元喜欢" -> "1万元，喜欢"、"预算1万元喜欢" -> "预算1万元，喜欢"
  result = result.replace(/(\d+[万千百]?[元块])([^\d，。！？、；：]{2,})/g, '$1，$2');
  
  // 3. 在地名/地点后、数字前添加逗号（更精确的匹配）
  // 例如："日本5天" -> "日本，5天"、"北京3天" -> "北京，3天"
  // 匹配1-4个非数字、非标点的字符，后面紧跟数字+时间单位
  result = result.replace(/([^\d，。！？、；：\s]{1,4})(\d+[天日月年个周])/g, '$1，$2');
  
  // 4. 在"和"、"与"连接的并列项后、其他内容前添加逗号
  // 例如："美食和动漫带孩子" -> "美食和动漫，带孩子"
  result = result.replace(/([^，。！？、；：]+)(和|与)([^，。！？、；：]+)(带孩子|带家人|带朋友)/g, '$1$2$3，$4');
  
  // 5. 在"带孩子"、"带家人"等短语前添加逗号（如果前面没有逗号）
  result = result.replace(/([^，。！？、；：])(带孩子|带家人|带朋友)/g, '$1，$2');
  
  // 6. 在"预算"、"花费"等词后、如果后面是数字+单位+其他内容，在单位后添加逗号
  // 例如："预算1万元喜欢" -> "预算1万元，喜欢"（已在规则2处理）
  
  // 7. 清理多余的逗号和空格
  result = result.replace(/，+/g, '，');
  result = result.replace(/，\s*，/g, '，');
  result = result.replace(/\s+/g, '');
  
  // 8. 检查是否是疑问句
  const questionWords = [
    '什么', '哪里', '哪儿', '怎么', '怎样', '为什么', '为何', '谁', '哪个', 
    '哪些', '多少', '何时', '什么时候', '会不会', '是否', '能不能', '可不可以',
    '吗', '呢', '么', '如何'
  ];
  const isQuestion = questionWords.some(word => result.includes(word));
  
  // 9. 检查是否是感叹句
  const exclamationWords = ['太棒', '真好', '真美', '太好了', '真不错', '真厉害', '好棒', '好厉害', '太美', '太棒了'];
  const isExclamation = exclamationWords.some(word => result.includes(word)) ||
                        /[哇啊呀]$/.test(result) ||
                        /太(棒|好|美)了?$/.test(result);
  
  // 10. 添加句末标点
  if (isQuestion) {
    result += '？';
  } else if (isExclamation) {
    result += '！';
  } else {
    result += '。';
  }
  
  return result;
}

export default function VoiceInput({ onText }) {
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const recRef = useRef(null);
  // 使用 ref 存储最新的文本值，避免闭包问题
  const finalTextRef = useRef('');
  const interimTextRef = useRef('');
  const onTextRef = useRef(onText);

  // 保持 onText 回调的最新引用
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SR) return;
    
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = true; // 持续录音，直到手动停止
    rec.interimResults = true; // 显示中间结果，提高用户体验
    rec.maxAlternatives = 1;
    
    rec.onresult = (e) => {
      let interim = '';
      let final = '';
      
      // 处理所有识别结果（从 resultIndex 开始的新结果）
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          // 最终结果，累积到最终文本中
          final += transcript;
        } else {
          // 中间结果（实时显示，会不断更新）
          interim += transcript;
        }
      }
      
      // 更新显示的文本和 ref
      if (final) {
        // 累积最终结果
        setFinalText(prev => {
          const newText = prev + final;
          finalTextRef.current = newText;
          return newText;
        });
      }
      // 中间结果总是显示最新的
      setInterimText(interim);
      interimTextRef.current = interim;
    };
    
    rec.onend = () => {
      // 录音结束时，发送所有累积的文本（使用 ref 获取最新值）
      let textToSend = finalTextRef.current + interimTextRef.current;
      if (textToSend.trim()) {
        // 智能添加标点符号
        textToSend = addPunctuation(textToSend.trim());
        onTextRef.current(textToSend);
      }
      setListening(false);
      setInterimText('');
      setFinalText('');
      finalTextRef.current = '';
      interimTextRef.current = '';
    };
    
    rec.onerror = (e) => {
      console.error('语音识别错误:', e.error);
      if (e.error === 'no-speech') {
        // 没有检测到语音，不自动停止，让用户手动控制
        return;
      }
      setListening(false);
      setInterimText('');
      setFinalText('');
      finalTextRef.current = '';
      interimTextRef.current = '';
    };
    
    recRef.current = rec;
    
    // 清理函数
    return () => {
      if (recRef.current) {
        try {
          recRef.current.stop();
        } catch (e) {
          // 忽略停止错误
        }
      }
    };
  }, []); // 空依赖数组，只在组件挂载时初始化一次

  const start = () => {
    if (!recRef.current) {
      alert('当前浏览器不支持 Web 语音识别，您可直接输入文字');
      return;
    }
    try {
      setListening(true);
      setInterimText('');
      setFinalText('');
      finalTextRef.current = '';
      interimTextRef.current = '';
      recRef.current.start();
    } catch (error) {
      console.error('启动录音失败:', error);
      setListening(false);
    }
  };

  const stop = () => {
    if (recRef.current && listening) {
      try {
        // 停止录音，会触发 onend 事件
        recRef.current.stop();
      } catch (error) {
        console.error('停止录音失败:', error);
        setListening(false);
        setInterimText('');
        setFinalText('');
        finalTextRef.current = '';
        interimTextRef.current = '';
      }
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 8 }}>
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
            正在录音中，请点击"停止录音"完成输入
          </span>
        )}
      </div>
      
      {/* 显示实时识别结果 */}
      {(interimText || finalText) && (
        <div 
          style={{ 
            padding: '8px 12px',
            background: 'var(--bg-secondary, rgba(0,0,0,0.05))',
            borderRadius: '4px',
            fontSize: '14px',
            minHeight: '40px',
            marginTop: 8,
            border: '1px solid var(--border, rgba(0,0,0,0.1))'
          }}
        >
          {finalText && (
            <span style={{ color: 'var(--text, #333)' }}>{finalText}</span>
          )}
          {interimText && (
            <span style={{ color: 'var(--muted, #666)', fontStyle: 'italic' }}>
              {interimText}
            </span>
          )}
        </div>
      )}
    </div>
  );
}


