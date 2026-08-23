const MASKS: Record<string, { display: string; pinyin: string }> = {
  腾: { display: "誊", pinyin: "teng" },
  讯: { display: "訓", pinyin: "xun" },
  阿: { display: "亜", pinyin: "a" },
  里: { display: "俚", pinyin: "li" },
  百: { display: "佰", pinyin: "bai" },
  度: { display: "渡", pinyin: "du" },
  京: { display: "惊", pinyin: "jing" },
  东: { display: "冬", pinyin: "dong" },
};

export default function MaskedCompanyName({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={className} title="公开展示已对部分公司名称脱敏">
      {Array.from(name).map((character, index) => {
        const mask = MASKS[character];
        if (!mask) return <span key={character + "-" + index}>{character}</span>;
        return (
          <ruby key={character + "-" + index} className="company-name-mask text-red-600">
            {mask.display}<rt className="text-[0.55em] font-medium leading-none text-red-500">{mask.pinyin}</rt>
          </ruby>
        );
      })}
    </span>
  );
}
