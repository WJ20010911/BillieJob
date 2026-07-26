import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Start seeding...\n");

  await prisma.record.deleteMany();
  await prisma.company.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.user.deleteMany();

  const companies = await Promise.all([
    prisma.company.create({
      data: {
        name: "星辰科技有限公司",
        alias: "星辰科技",
        description: "一家专注于企业级软件开发的科技公司",
        industry: "互联网/软件",
        score: 35,
        riskTags: JSON.stringify(["疑似电销", "薪资虚标", "文案高度雷同"]),
      },
    }),
    prisma.company.create({
      data: {
        name: "蓝海数据服务有限公司",
        alias: "蓝海数据",
        description: "大数据分析与数据服务提供商",
        industry: "大数据/数据分析",
        score: 75,
        riskTags: JSON.stringify([]),
      },
    }),
    prisma.company.create({
      data: {
        name: "云帆网络技术有限公司",
        alias: "云帆网络",
        description: "电商平台开发和运营",
        industry: "电子商务",
        score: 20,
        riskTags: JSON.stringify(["弹性工作=加班", "高提成陷阱", "疑似传销模式"]),
      },
    }),
    prisma.company.create({
      data: {
        name: "鼎盛金融信息服务有限公司",
        alias: "鼎盛金融",
        description: "金融信息中介服务",
        industry: "金融/保险",
        score: 15,
        riskTags: JSON.stringify(["保险电销", "底薪虚标", "频繁招聘"]),
      },
    }),
    prisma.company.create({
      data: {
        name: "绿洲教育科技有限公司",
        alias: "绿洲教育",
        description: "在线教育平台",
        industry: "教育/培训",
        score: 60,
        riskTags: JSON.stringify(["销售为主"]),
      },
    }),
    prisma.company.create({
      data: {
        name: "锐思创新咨询有限公司",
        alias: "锐思咨询",
        description: "企业管理咨询与战略规划",
        industry: "咨询/服务",
        score: 85,
        riskTags: JSON.stringify([]),
      },
    }),
  ]);

  console.log("Created " + companies.length + " companies\n");

  const recordData: Prisma.RecordUncheckedCreateInput[] = [
    {
      companyId: companies[0].id,
      type: "INTERVIEW_EXPERIENCE",
      city: "北京",
      title: "面试体验极差，HR 不专业",
      content: "约了下午两点面试，到了前台等了40分钟才有人来。面试官一直在看手机，问的问题和岗位完全无关。后来发现这个岗位一直在招，已经挂了半年了，怀疑是刷 KPI。",
      actualPosition: "Java 后端开发",
      salaryRange: "8K-13K（面试时说实际只有 6K）",
      workContent: "说是做后端，实际上还要兼运维和测试",
      isConsistentWithJD: false,
      status: "APPROVED",
    },
    {
      companyId: companies[0].id,
      type: "CHAT_SCREENSHOT",
      city: "上海",
      title: "HR 话术全是套路",
      content: "HR 在 Boss 直聘上主动联系我，说得天花乱坠。加了微信后一看朋友圈全是鸡汤和招聘广告。问具体工作内容就是弹性工作制、高提成、想赚钱的来，经典的电销话术。",
      status: "APPROVED",
    },
    {
      companyId: companies[0].id,
      type: "JD_SNAPSHOT",
      city: "深圳",
      title: "JD 和实际完全不符",
      content: "招聘写的是软件工程师 15K-25K，去了才知道底薪 4K+绩效，而且绩效基本拿不满。要求写的是本科以上，实际上初中毕业都要，怀疑 HR 在冲面试量。",
      salaryRange: "标称 15K-25K，实际底薪 4K",
      status: "APPROVED",
    },
    {
      companyId: companies[1].id,
      type: "INTERVIEW_EXPERIENCE",
      city: "杭州",
      title: "技术面不错，HR 面体验一般",
      content: "技术面问得挺专业的，算法和项目经验都聊了。但 HR 面的时候一直压薪资，说行业不景气。最后给的 offer 比预期的低了一些，不过整体还算正规。",
      actualPosition: "数据分析师",
      salaryRange: "12K-16K",
      workContent: "主要是 SQL 取数、报表制作、简单的分析",
      isConsistentWithJD: true,
      status: "APPROVED",
    },
    {
      companyId: companies[2].id,
      type: "CHAT_SCREENSHOT",
      city: "深圳",
      title: "HR 像微商，一直在画饼",
      content: "HR 说话方式特别像微商，我们这个项目前景巨大、第一批加入的都是元老。问具体薪资结构就含糊其辞，说看能力。公司在招聘网站上一天发几十个岗位。",
      status: "APPROVED",
    },
    {
      companyId: companies[2].id,
      type: "INTERVIEW_EXPERIENCE",
      city: "广州",
      title: "办公室像传销窝点",
      content: "去了发现办公室在一个老旧写字楼里，里面挂着各种励志横幅，喊口号。面试官说我们不要打工思维。面试全程在讲梦想和未来，技术问题一个没问。",
      actualPosition: "市场推广",
      salaryRange: "底薪 3K + 提成",
      workContent: "地推拉人头，发展下线",
      isConsistentWithJD: false,
      status: "APPROVED",
    },
    {
      companyId: companies[3].id,
      type: "CHAT_SCREENSHOT",
      city: "上海",
      title: "典型的保险电销套路",
      content: "在招聘网站上看到是金融顾问，去了才知道是打电话卖保险。HR 说平均薪资 8K-15K，但老员工透露前三个月基本只有底薪 3K，大部分人干不过一个月。",
      status: "APPROVED",
    },
    {
      companyId: companies[4].id,
      type: "INTERVIEW_EXPERIENCE",
      city: "成都",
      title: "课程顾问等于销售，但还算正规",
      content: "面试的是课程顾问岗位，其实就是电话销售。不过公司流程挺正规的，有五险一金。工作压力比较大，每个月有硬性指标。适合想赚钱不怕吃苦的人。",
      actualPosition: "课程顾问",
      salaryRange: "5K-10K（底薪+提成）",
      workContent: "电话销售课程，维护客户关系",
      isConsistentWithJD: true,
      status: "APPROVED",
    },
    {
      companyId: companies[5].id,
      type: "INTERVIEW_EXPERIENCE",
      city: "北京",
      title: "很专业的面试体验",
      content: "三轮面试流程清晰：HR 初筛到业务总监面到合伙人终面。面试官很专业，会深挖项目经验，也坦诚地介绍了项目的难点和挑战。薪资给得很大方，offer 流程也很快。入职后氛围很好，带教制度完善。推荐！",
      actualPosition: "管理咨询顾问",
      salaryRange: "18K-25K",
      workContent: "行业研究、客户访谈、方案撰写",
      isConsistentWithJD: true,
      status: "APPROVED",
    },
  ];

  for (const data of recordData) {
    await prisma.record.create({ data });
  }

  console.log("Created " + recordData.length + " records\n");

  await prisma.user.create({
    data: { identifier: "13800138000", membershipDays: 5 },
  });
  console.log("Test user created (13800138000, 5 days membership)\n");

  await prisma.adminUser.create({
    data: { username: "admin", passwordHash: "admin123" },
  });
  console.log("Admin created (admin / admin123)\n");
  console.log("Seeding complete!");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
