export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">免责声明与用户协议</h1>

      <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">1. 平台性质</h2>
          <p>
            本站是一个用户生成内容（UGC）共享平台，旨在为求职者提供面试经历和招聘信息参考。
            本站所有内容均由用户自愿上传分享，不代表平台立场。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">2. 内容免责</h2>
          <p>
            本站不对用户上传内容的真实性、准确性、完整性做任何保证。用户应结合多方信息独立判断，
            不应仅依赖本站内容做出求职决策。因依赖本站内容而产生的任何损失，本站不承担责任。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">3. 用户责任</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>用户应确保上传内容的真实性，不得恶意抹黑或虚构事实</li>
            <li>用户上传内容即授权平台在站内展示和分发</li>
            <li>用户不得上传包含个人隐私信息（姓名、电话、地址等）的内容</li>
            <li>违反上述规定的内容，平台有权删除并保留追究法律责任的权利</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">4. 隐私保护</h2>
          <p>
            本站自动对用户上传内容进行脱敏处理。我们不会收集用户的个人身份信息。
            上传内容中的个人隐私信息由用户自行负责脱敏。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">5. 企业申诉</h2>
          <p>
            如企业认为本站内容存在不实信息或恶意抹黑，可通过联系平台提交证明材料，
            平台审核后将依法处理。申诉请提供企业资质证明和相关证据材料。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">6. 协议更新</h2>
          <p>
            本站保留随时修改本协议的权利，修改后的协议一经发布即生效。
            建议用户定期查阅本页面以了解最新条款。
          </p>
        </section>

        <div className="border-t border-gray-200 pt-4 text-xs text-gray-400">
          <p>最后更新：2026 年 7 月</p>
        </div>
      </div>
    </div>
  );
}
