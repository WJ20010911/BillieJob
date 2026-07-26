export interface Province {
  name: string;
  cities: string[];
}

export const PROVINCES: Province[] = [
  {
    name: "北京",
    cities: ["北京市"],
  },
  {
    name: "上海",
    cities: ["上海市"],
  },
  {
    name: "广东",
    cities: ["广州", "深圳", "东莞", "佛山", "珠海", "中山", "惠州"],
  },
  {
    name: "浙江",
    cities: ["杭州", "宁波", "温州", "嘉兴", "绍兴"],
  },
  {
    name: "江苏",
    cities: ["南京", "苏州", "无锡", "常州", "徐州"],
  },
  {
    name: "四川",
    cities: ["成都"],
  },
  {
    name: "湖北",
    cities: ["武汉"],
  },
  {
    name: "陕西",
    cities: ["西安"],
  },
  {
    name: "重庆",
    cities: ["重庆市"],
  },
  {
    name: "湖南",
    cities: ["长沙"],
  },
  {
    name: "天津",
    cities: ["天津市"],
  },
  {
    name: "河南",
    cities: ["郑州", "洛阳"],
  },
  {
    name: "山东",
    cities: ["青岛", "济南", "烟台", "潍坊"],
  },
  {
    name: "安徽",
    cities: ["合肥"],
  },
  {
    name: "福建",
    cities: ["厦门", "福州", "泉州"],
  },
  {
    name: "辽宁",
    cities: ["沈阳", "大连"],
  },
  {
    name: "黑龙江",
    cities: ["哈尔滨"],
  },
  {
    name: "吉林",
    cities: ["长春"],
  },
  {
    name: "河北",
    cities: ["石家庄", "保定", "唐山"],
  },
  {
    name: "山西",
    cities: ["太原"],
  },
  {
    name: "贵州",
    cities: ["贵阳"],
  },
  {
    name: "广西",
    cities: ["南宁"],
  },
  {
    name: "甘肃",
    cities: ["兰州"],
  },
  {
    name: "海南",
    cities: ["海口"],
  },
  {
    name: "江西",
    cities: ["南昌"],
  },
  {
    name: "云南",
    cities: ["昆明"],
  },
];

// Flat city list for backward compatibility in search API etc
export const ALL_CITIES: string[] = PROVINCES.flatMap((p) => p.cities);
