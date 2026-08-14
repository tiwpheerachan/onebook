import type { HelpCategory, HelpGap } from './types';

/**
 * คู่มือการใช้งาน ONEBOOK
 *
 * โครงหมวดหมู่เดินตามแนวเดียวกับคู่มือของโปรแกรมบัญชีไทยที่คนคุ้นเคย
 * (ตั้งค่า → ขาย → ซื้อ → การเงิน-บัญชี → สินค้า/สินทรัพย์ → ภาษี → รายงาน)
 * เพื่อให้คนที่ย้ายมาจากโปรแกรมอื่นหาหัวข้อเจอทันที
 *
 * แต่เนื้อหาทั้งหมดเขียนขึ้นใหม่จากการทำงานจริงของ ONEBOOK
 * ไม่ได้คัดลอกข้อความจากคู่มือของผู้ให้บริการรายใด
 */
export const HELP: HelpCategory[] = [
  /* ─────────────────────────── เริ่มต้นใช้งาน ─────────────────────────── */
  {
    slug: 'start', icon: 'Rocket',
    title: { th: 'เริ่มต้นใช้งาน', en: 'Getting started', zh: '快速上手' },
    summary: {
      th: 'สิ่งที่ต้องรู้ในวันแรก เข้าระบบ สลับบริษัท และหาของให้เจอเร็ว',
      en: 'What you need on day one — signing in, switching company, finding things fast',
      zh: '第一天必备：登录、切换公司、快速找到所需内容',
    },
    articles: [
      {
        slug: 'sign-in',
        title: { th: 'เข้าสู่ระบบและสิทธิ์ของคุณ', en: 'Signing in and your access', zh: '登录与你的权限' },
        summary: {
          th: 'ระบบมีสองทางเข้า และสิทธิ์ถูกกำหนดแยกตามบริษัท',
          en: 'There are two ways in, and access is granted per company',
          zh: '有两种登录方式，权限按公司分别授予',
        },
        steps: [
          { th: 'กด "เข้าสู่ระบบด้วย GoodHR" ถ้าองค์กรใช้บัญชีพนักงานร่วมกัน หรือกรอกอีเมล/รหัสผ่านที่ผู้ดูแลออกให้', en: 'Use “Sign in with GoodHR” if your organisation shares staff accounts, or enter the email and password your administrator issued.', zh: '如公司统一使用员工账号，请点击「使用 GoodHR 登录」；否则输入管理员发放的邮箱与密码。' },
          { th: 'เข้าครั้งแรกแล้วขึ้นว่ายังไม่ได้รับอนุญาต แปลว่ายังไม่มีรายชื่อในระบบ ให้แจ้งผู้ดูแลเพิ่มสิทธิ์ก่อน', en: 'If the first sign-in says you are not authorised, you are not on the access list yet — ask an administrator to add you.', zh: '若首次登录提示未获授权，说明尚未加入名单，请联系管理员开通。' },
          { th: 'เข้าได้แล้วให้เปิด "โปรไฟล์ของฉัน" ตรวจว่าบริษัทและบทบาทตรงกับงานที่รับผิดชอบ', en: 'Once in, open “My profile” and check the companies and roles match your responsibilities.', zh: '登录后打开「我的资料」，核对公司与角色是否与职责相符。' },
        ],
        tips: [
          { th: 'บทบาทใน ONEBOOK ไม่เกี่ยวกับตำแหน่งงานใน HR — กำหนดแยกกันคนละชุด', en: 'Your ONEBOOK role is separate from your HR job title — they are configured independently.', zh: 'ONEBOOK 中的角色与人事系统的职位无关，两者独立设置。' },
        ],
        href: '/settings/profile',
      },
      {
        slug: 'switch-company',
        title: { th: 'สลับบริษัทและดูภาพรวมกลุ่ม', en: 'Switching company and group view', zh: '切换公司与查看集团总览' },
        summary: {
          th: 'ทุกหน้าจอผูกกับบริษัทที่เลือกอยู่ ต้องเลือกให้ถูกก่อนบันทึก',
          en: 'Every screen belongs to the company you have selected — pick the right one before saving',
          zh: '所有页面均基于当前所选公司，保存前务必选对。',
        },
        steps: [
          { th: 'กดชื่อบริษัทมุมซ้ายบนเพื่อสลับ ระบบจะจำไว้จนกว่าจะเปลี่ยนอีกครั้ง', en: 'Click the company name at the top-left to switch. Your choice is remembered until you change it.', zh: '点击左上角公司名称即可切换，系统会记住你的选择。' },
          { th: 'เปิด "ภาพรวมกลุ่มบริษัท" เมื่ออยากเห็นทุกบริษัทรวมกันในหน้าเดียว', en: 'Open “Group overview” to see every company consolidated on one screen.', zh: '打开「集团总览」可在一个页面查看所有公司的汇总。' },
        ],
        tips: [
          { th: 'เอกสารที่สร้างจะอยู่กับบริษัทที่เลือกตอนกดบันทึก ย้ายข้ามบริษัทภายหลังไม่ได้', en: 'A document belongs to whichever company was selected when you saved it. It cannot be moved to another company afterwards.', zh: '单据归属于保存时所选的公司，事后无法转到其他公司。' },
        ],
        href: '/group',
        resource: 'report',
      },
      {
        slug: 'search-and-ai',
        title: { th: 'ค้นหาทุกอย่างและถาม AI', en: 'Search everything and ask AI', zh: '全局搜索与问 AI' },
        summary: {
          th: 'ช่องเดียวค้นได้ทั้งเอกสาร ผู้ติดต่อ สินค้า และงาน',
          en: 'One box searches documents, contacts, products and tasks',
          zh: '一个搜索框即可查找单据、联系人、商品与任务',
        },
        steps: [
          { th: 'กด ⌘K (หรือ Ctrl+K) หรือปุ่ม / เพื่อเปิดช่องค้นหาได้จากทุกหน้า', en: 'Press ⌘K (or Ctrl+K), or just /, to open search from any page.', zh: '在任意页面按 ⌘K（或 Ctrl+K），或直接按 / 打开搜索。' },
          { th: 'พิมพ์ได้ทั้งเลขที่เอกสาร ชื่อลูกค้า เลขผู้เสียภาษี เบอร์โทร รหัสสินค้า หรือยอดเงิน', en: 'Type a document number, customer name, tax ID, phone number, SKU or an amount.', zh: '可输入单据号、客户名称、税号、电话、商品编码或金额。' },
          { th: 'กด ⌘J เรียกผู้ช่วย AI ให้ช่วยหาและสรุปเป็นภาษาพูด', en: 'Press ⌘J to ask the AI assistant to find and summarise things in plain language.', zh: '按 ⌘J 唤起 AI 助手，用日常语言查找并总结。' },
        ],
        tips: [
          { th: 'ผลค้นหาถูกกรองด้วยสิทธิ์ของคุณเสมอ สิ่งที่ไม่มีสิทธิ์ดูจะไม่ปรากฏ', en: 'Results are always filtered by your permissions — anything you cannot open will not appear.', zh: '搜索结果始终按你的权限过滤，无权查看的内容不会出现。' },
          { th: 'AI อ่านอย่างเดียว สร้างหรือแก้เอกสารให้ไม่ได้ ต้องทำเองที่หน้าเอกสาร', en: 'The AI is read-only. It cannot create or edit documents — do that yourself on the document screen.', zh: 'AI 仅可读取，无法新建或修改单据，需自行在单据页面操作。' },
        ],
      },
    ],
  },

  /* ─────────────────────────── ตั้งค่าองค์กร ─────────────────────────── */
  {
    slug: 'setup', icon: 'Settings',
    title: { th: 'ตั้งค่าองค์กร', en: 'Organisation setup', zh: '企业设置' },
    summary: {
      th: 'สิ่งที่ควรตั้งให้เสร็จก่อนเริ่มออกเอกสารจริง',
      en: 'What to finish before you issue real documents',
      zh: '开具正式单据前应完成的设置',
    },
    articles: [
      {
        slug: 'company-info',
        title: { th: 'ข้อมูลบริษัทและหัวเอกสาร', en: 'Company details and document header', zh: '公司资料与单据抬头' },
        summary: {
          th: 'ข้อมูลชุดนี้จะไปโผล่บนเอกสารที่พิมพ์ให้ลูกค้า',
          en: 'These details appear on every document you print for customers',
          zh: '这些资料会出现在打印给客户的每一张单据上',
        },
        steps: [
          { th: 'เปิดตั้งค่า → บริษัทในเครือ แล้วเลือกบริษัทที่ต้องการแก้', en: 'Open Settings → Companies and pick the company you want to edit.', zh: '打开「设置 → 集团公司」，选择要编辑的公司。' },
          { th: 'กรอกชื่อตามหนังสือรับรอง เลขผู้เสียภาษี ที่อยู่ และรหัสสาขา ให้ตรงกับที่จดทะเบียน', en: 'Enter the registered name, tax ID, address and branch code exactly as registered.', zh: '按登记资料填写公司名称、税号、地址与分支编号。' },
          { th: 'อัปโหลดโลโก้และลายเซ็นผู้มีอำนาจ เพื่อให้เอกสารพิมพ์ออกมาสมบูรณ์', en: 'Upload the logo and authorised signature so printed documents come out complete.', zh: '上传公司标志与授权签名，使打印单据完整。' },
        ],
        tips: [
          { th: 'เลขผู้เสียภาษี 13 หลักมีหลักตรวจสอบ ระบบจะเตือนถ้ากรอกผิด', en: 'The 13-digit tax ID has a check digit — the system warns you if it is wrong.', zh: '13 位税号带校验位，填错时系统会提示。' },
        ],
        href: '/settings/companies',
        resource: 'settings.companies',
      },
      {
        slug: 'users-roles',
        title: { th: 'ผู้ใช้งานและสิทธิ์', en: 'Users and permissions', zh: '用户与权限' },
        summary: {
          th: 'ค่าเริ่มต้นคือเข้าไม่ได้ ต้องอนุญาตรายคนก่อนเสมอ',
          en: 'The default is no access — every person must be granted access individually',
          zh: '默认无权限，每个人都必须单独授权',
        },
        steps: [
          { th: 'สร้างบทบาทที่หน้าบทบาทและสิทธิ์ก่อน กำหนดว่าบทบาทนั้นเห็นเมนูไหนและทำอะไรได้', en: 'Create a role first under Roles and permissions, defining which menus it sees and what it may do.', zh: '先在「角色与权限」中创建角色，定义可见菜单与可执行操作。' },
          { th: 'ไปที่ผู้ใช้งาน แล้วเพิ่มคน พร้อมเลือกบริษัทและบทบาทของแต่ละบริษัท', en: 'Go to Users, add the person, then choose their company and role for each company.', zh: '进入「用户」添加人员，并为每家公司分别选择角色。' },
          { th: 'ถ้าใช้ GoodHR ให้กด "อนุญาตพนักงาน GoodHR" แล้วใส่รหัสพนักงานหรืออีเมลไว้ล่วงหน้าได้', en: 'If you use GoodHR, click “Allow GoodHR employee” and enter the employee code or email in advance.', zh: '若使用 GoodHR，点击「允许 GoodHR 员工」，可提前填写员工编号或邮箱。' },
        ],
        tips: [
          { th: 'ให้สิทธิ์เท่าที่จำเป็นต่องาน เช่น ฝ่ายขายไม่ต้องเห็นราคาทุน ตั้งซ่อนฟิลด์ได้ในบทบาท', en: 'Grant only what the job needs — sales staff rarely need cost prices, and roles can hide specific fields.', zh: '按岗位所需授予权限，例如销售无需查看成本价，角色可隐藏特定字段。' },
        ],
        href: '/settings/users',
        resource: 'settings.users',
      },
      {
        slug: 'numbering',
        title: { th: 'รูปแบบเลขที่เอกสาร', en: 'Document numbering', zh: '单据编号规则' },
        summary: {
          th: 'ตั้งให้ตรงกับที่ใช้อยู่เดิม ก่อนออกเอกสารใบแรก',
          en: 'Match your existing scheme before you issue the first document',
          zh: '在开具第一张单据前，先与现行编号方式对齐',
        },
        steps: [
          { th: 'เปิดตั้งค่า → รูปแบบเลขที่เอกสาร แล้วเลือกประเภทเอกสารที่ต้องการ', en: 'Open Settings → Document numbering and select the document type.', zh: '打开「设置 → 单据编号规则」，选择单据类型。' },
          { th: 'กำหนดคำนำหน้า รูปแบบปี/เดือน และจำนวนหลัก ระบบจะแสดงตัวอย่างเลขถัดไปให้ดูทันที', en: 'Set the prefix, year/month pattern and digit count — a preview of the next number appears immediately.', zh: '设置前缀、年月格式与位数，系统会立即显示下一个编号预览。' },
        ],
        tips: [
          { th: 'เปลี่ยนรูปแบบกลางปีได้ แต่เลขเดิมจะไม่ถูกแก้ย้อนหลัง', en: 'You can change the pattern mid-year, but existing numbers are never rewritten.', zh: '可在年中调整规则，但已生成的编号不会被改写。' },
        ],
        href: '/settings/numbering',
        resource: 'settings.numbering',
      },
    ],
  },

  /* ─────────────────────────── ขาย – รับเงิน ─────────────────────────── */
  {
    slug: 'sales', icon: 'TrendingUp',
    title: { th: 'เอกสารขาย – รับเงิน', en: 'Sales and receipts', zh: '销售与收款' },
    summary: {
      th: 'ตั้งแต่ใบเสนอราคาจนถึงรับเงินและออกใบเสร็จ',
      en: 'From quotation through to payment and receipt',
      zh: '从报价单到收款开票的完整流程',
    },
    articles: [
      {
        slug: 'sales-flow',
        title: { th: 'ลำดับเอกสารขายที่ถูกต้อง', en: 'The correct sales document order', zh: '正确的销售单据顺序' },
        summary: {
          th: 'แต่ละใบต่อยอดจากใบก่อนหน้า ไม่ต้องพิมพ์ซ้ำ',
          en: 'Each document carries forward from the previous one — no retyping',
          zh: '每张单据都从上一张延续，无需重复录入',
        },
        steps: [
          { th: 'ใบเสนอราคา → ใบแจ้งหนี้ → ใบกำกับภาษี → ใบเสร็จรับเงิน คือเส้นทางมาตรฐาน', en: 'Quotation → invoice → tax invoice → receipt is the standard path.', zh: '报价单 → 发票 → 税务发票 → 收据，是标准流程。' },
          { th: 'เปิดเอกสารใบก่อนหน้าแล้วกดสร้างเอกสารถัดไป ข้อมูลลูกค้าและรายการจะถูกยกมาให้', en: 'Open the previous document and create the next one from it — customer and line items are carried over.', zh: '打开上一张单据并由此创建下一张，客户与明细会自动带入。' },
          { th: 'ไม่ต้องใช้ทุกใบก็ได้ ถ้าขายสดออกใบกำกับภาษีอย่างย่อ/ใบเสร็จได้เลย', en: 'You do not have to use every step — for cash sales you can issue the receipt directly.', zh: '无需每一步都用；现金销售可直接开具收据。' },
        ],
        tips: [
          { th: 'อยากรู้ว่าใบไหนมาจากใบไหน กดดู "ที่มาของตัวเลข" ในเอกสารจะเห็นสายโยงทั้งเส้น', en: 'To see how documents connect, open “Number provenance” on any document to view the whole chain.', zh: '想了解单据关联，可在单据中打开「数据溯源」查看完整链路。' },
        ],
        href: '/sales/quotations',
        resource: 'documents',
      },
      {
        slug: 'receive-payment',
        title: { th: 'รับเงินและตัดยอดลูกหนี้', en: 'Receiving payment and clearing receivables', zh: '收款与核销应收' },
        summary: {
          th: 'บันทึกรับเงินให้ถูกช่องทาง ยอดลูกหนี้จะลดเอง',
          en: 'Record the receipt against the right channel and receivables clear themselves',
          zh: '将收款记入正确渠道，应收账款会自动核销',
        },
        steps: [
          { th: 'เปิดใบแจ้งหนี้ที่ค้างรับ แล้วกดรับชำระ', en: 'Open the outstanding invoice and click Receive payment.', zh: '打开未收款的发票，点击「收款」。' },
          { th: 'เลือกช่องทางการเงินที่เงินเข้าจริง และใส่วันที่ตามที่เงินเข้าบัญชี', en: 'Choose the finance channel the money actually landed in and use the real value date.', zh: '选择实际到账的资金渠道，并填写真实到账日期。' },
          { th: 'ถ้าลูกค้าหักภาษี ณ ที่จ่าย ให้ใส่ยอดหักไว้ในช่องภาษีหัก ณ ที่จ่าย ระบบจะคำนวณยอดสุทธิให้', en: 'If the customer withheld tax, enter the withheld amount and the net payable is calculated for you.', zh: '若客户已代扣所得税，请填写扣缴金额，系统会自动计算净额。' },
        ],
        tips: [
          { th: 'รับเงินบางส่วนได้ สถานะจะเป็น "ชำระบางส่วน" จนกว่าจะครบ', en: 'Partial payments are fine — the status stays “partial” until fully settled.', zh: '支持部分收款，未结清前状态保持「部分收款」。' },
        ],
        href: '/finance/payments',
        resource: 'finance.payments',
      },
      {
        slug: 'print-send',
        title: { th: 'พิมพ์และส่งเอกสารให้ลูกค้า', en: 'Printing and sending documents', zh: '打印与发送单据' },
        summary: {
          th: 'พิมพ์ได้ตามแบบไทย พร้อม QR พร้อมเพย์และตัวหนังสือจำนวนเงิน',
          en: 'Thai-format printing with PromptPay QR and amount in words',
          zh: '按泰国格式打印，含 PromptPay 二维码与金额大写',
        },
        steps: [
          { th: 'เปิดเอกสารแล้วกดพิมพ์ ระบบจะจัดหน้า A4 ให้พร้อมสำเนา', en: 'Open the document and click Print — an A4 layout with copies is prepared for you.', zh: '打开单据并点击「打印」，系统会生成含副本的 A4 版面。' },
          { th: 'ตั้งพร้อมเพย์ไว้ที่ช่องทางการเงิน แล้ว QR จะขึ้นบนเอกสารพร้อมยอดที่ต้องจ่าย', en: 'Set up PromptPay on the finance channel and the QR appears on the document with the amount pre-filled.', zh: '在资金渠道设置 PromptPay 后，单据上会显示带金额的二维码。' },
        ],
        tips: [
          { th: 'ทุกครั้งที่พิมพ์ระบบบันทึกไว้ว่าใครพิมพ์เมื่อไร ตรวจย้อนหลังได้', en: 'Every print is logged with who printed it and when, so it can be audited later.', zh: '每次打印都会记录操作人与时间，便于日后审计。' },
        ],
        resource: 'documents',
      },
    ],
  },

  /* ─────────────────────────── ซื้อ – จ่ายเงิน ─────────────────────────── */
  {
    slug: 'purchase', icon: 'ShoppingCart',
    title: { th: 'เอกสารซื้อ – จ่ายเงิน', en: 'Purchases and payments', zh: '采购与付款' },
    summary: {
      th: 'ตั้งแต่ขออนุมัติซื้อจนถึงจ่ายเงินและหักภาษี ณ ที่จ่าย',
      en: 'From purchase approval through payment and withholding tax',
      zh: '从采购审批到付款及代扣所得税',
    },
    articles: [
      {
        slug: 'purchase-flow',
        title: { th: 'ลำดับเอกสารซื้อ', en: 'The purchase document order', zh: '采购单据顺序' },
        summary: {
          th: 'ใบขอซื้อ → ใบสั่งซื้อ → ใบรับสินค้า → ซื้อสินค้า/บริการ',
          en: 'Requisition → purchase order → goods receipt → bill',
          zh: '请购单 → 采购订单 → 收货单 → 采购单',
        },
        steps: [
          { th: 'เริ่มที่ใบขอซื้อเมื่อองค์กรต้องมีการอนุมัติก่อนสั่ง', en: 'Start with a requisition when your organisation requires approval before ordering.', zh: '若公司要求先审批后下单，请从请购单开始。' },
          { th: 'อนุมัติแล้วสร้างใบสั่งซื้อต่อ แล้วบันทึกใบรับสินค้าเมื่อของมาถึง', en: 'Once approved, create the purchase order, then record a goods receipt when the items arrive.', zh: '审批通过后创建采购订单，货到时登记收货单。' },
          { th: 'เมื่อได้ใบกำกับภาษีจากผู้ขาย ให้บันทึกเป็นซื้อสินค้า/บริการ ยอดเจ้าหนี้จะขึ้น', en: 'When the supplier’s tax invoice arrives, record it as a bill — payables are raised at that point.', zh: '收到供应商税务发票后登记为采购单，此时产生应付账款。' },
        ],
        tips: [
          { th: 'ซื้อของเล็กน้อยที่ไม่ต้องอนุมัติ ใช้ "บันทึกค่าใช้จ่าย" ใบเดียวจบ', en: 'For small purchases that need no approval, a single “expense” entry is enough.', zh: '无需审批的小额采购，直接用「费用记账」一张单即可。' },
        ],
        href: '/purchase/purchase-orders',
        resource: 'documents',
      },
      {
        slug: 'ai-import',
        title: { th: 'อ่านบิลด้วย AI แทนการพิมพ์เอง', en: 'Reading bills with AI instead of typing', zh: '用 AI 读取账单，免去手工录入' },
        summary: {
          th: 'อัปโหลดไฟล์แล้วให้ระบบดึงข้อมูลมาให้ตรวจก่อนบันทึก',
          en: 'Upload a file and let the system extract the fields for you to check before saving',
          zh: '上传文件，由系统提取字段，确认后再保存',
        },
        steps: [
          { th: 'เปิดนำเข้าด้วย AI แล้วอัปโหลดไฟล์ PDF หรือรูปถ่ายใบกำกับภาษี', en: 'Open AI import and upload a PDF or a photo of the tax invoice.', zh: '打开「AI 导入」，上传税务发票的 PDF 或照片。' },
          { th: 'รอระบบอ่านเสร็จ แล้วตรวจข้อมูลที่ดึงมา โดยเฉพาะยอดเงินและเลขผู้เสียภาษี', en: 'Wait for processing, then check the extracted data — especially amounts and the tax ID.', zh: '等待识别完成后核对提取结果，尤其是金额与税号。' },
          { th: 'ถูกต้องแล้วกดสร้างเอกสาร ระบบจะสร้างรายการจริงพร้อมแนบไฟล์ต้นฉบับไว้ให้', en: 'When correct, create the document — the entry is created with the original file attached.', zh: '确认无误后生成单据，系统会附上原始文件。' },
        ],
        tips: [
          { th: 'ตรวจทุกครั้งก่อนกดสร้าง AI อ่านผิดได้โดยเฉพาะลายมือและใบที่ถ่ายเอียง', en: 'Always review before creating — AI misreads handwriting and skewed photos.', zh: '生成前务必复核，手写体与拍歪的单据容易识别错误。' },
        ],
        href: '/documents/ai-import',
        resource: 'documents.ai_import',
      },
    ],
  },

  /* ─────────────────────────── การเงินและบัญชี ─────────────────────────── */
  {
    slug: 'finance', icon: 'Wallet',
    title: { th: 'การเงินและบัญชี', en: 'Finance and accounting', zh: '资金与会计' },
    summary: {
      th: 'ช่องทางการเงิน กระทบยอดธนาคาร และสมุดบัญชี',
      en: 'Finance channels, bank reconciliation and the ledger',
      zh: '资金渠道、银行对账与账簿',
    },
    articles: [
      {
        slug: 'channels',
        title: { th: 'ช่องทางการเงินและยอดคงเหลือ', en: 'Finance channels and balances', zh: '资金渠道与余额' },
        summary: {
          th: 'ทุกการรับ-จ่ายต้องระบุช่องทาง ยอดคงเหลือจึงจะเชื่อถือได้',
          en: 'Every receipt and payment names a channel — that is what makes balances trustworthy',
          zh: '每笔收付都需指定渠道，余额才可靠',
        },
        steps: [
          { th: 'สร้างช่องทางให้ครบทั้งเงินสด บัญชีธนาคารแต่ละบัญชี และกระเป๋าเงินอิเล็กทรอนิกส์', en: 'Create a channel for cash, for each bank account, and for each e-wallet.', zh: '为现金、各银行账户及电子钱包分别创建渠道。' },
          { th: 'ผูกช่องทางกับผังบัญชีให้ถูก เพราะยอดจะไหลไปลงบัญชีตามที่ผูกไว้', en: 'Map each channel to the correct chart-of-accounts entry — postings follow that mapping.', zh: '将渠道正确映射到会计科目，账务过账依此进行。' },
          { th: 'ดูยอดรวมทุกช่องทางได้ที่หน้าภาพรวมการเงิน', en: 'See the combined balance of every channel on the Finance overview.', zh: '在「财务总览」查看所有渠道的合计余额。' },
        ],
        tips: [
          { th: 'ถ้าหลายช่องทางผูกบัญชีแยกประเภทเดียวกัน ระบบจะนับยอดรวมให้เพียงครั้งเดียวและขึ้นคำเตือนไว้', en: 'If several channels share one ledger account, the total counts it once and shows a warning.', zh: '若多个渠道共用同一科目，合计只计一次并会给出提示。' },
        ],
        href: '/finance/channels',
        resource: 'finance.channels',
      },
      {
        slug: 'reconcile',
        title: { th: 'กระทบยอดธนาคาร', en: 'Bank reconciliation', zh: '银行对账' },
        summary: {
          th: 'นำเข้า statement แล้วจับคู่กับรายการในระบบ',
          en: 'Import the statement and match it against entries in the system',
          zh: '导入对账单并与系统记录逐笔匹配',
        },
        steps: [
          { th: 'ดาวน์โหลดไฟล์ CSV จากธนาคาร แล้วอัปโหลดที่หน้ากระทบยอด', en: 'Download the CSV from your bank and upload it on the reconciliation screen.', zh: '从银行下载 CSV，在对账页面上传。' },
          { th: 'กดจับคู่อัตโนมัติก่อน ระบบจะจับให้เฉพาะรายการที่ยอดตรงและวันใกล้กัน', en: 'Run auto-match first — it only pairs entries with equal amounts and close dates.', zh: '先运行自动匹配，仅配对金额相同且日期相近的记录。' },
          { th: 'ไล่จับคู่ที่เหลือด้วยมือ แล้วปิดกระทบยอดเมื่อผลต่างเป็นศูนย์', en: 'Match the remainder by hand, then close the reconciliation when the difference is zero.', zh: '手工匹配剩余记录，差额为零后关闭对账。' },
        ],
        tips: [
          { th: 'รายการที่ระบบมีแต่ธนาคารยังไม่มี เช่น เช็คที่ยังไม่ขึ้นเงิน เป็นเรื่องปกติ ไม่ต้องบังคับให้จับคู่', en: 'Entries in the books but not yet on the statement — uncleared cheques, for instance — are normal. Do not force a match.', zh: '账上有而银行尚未入账（如未兑现支票）属正常，不必强行匹配。' },
        ],
        href: '/finance/reconcile',
        resource: 'finance.reconcile',
      },
      {
        slug: 'trace',
        title: { th: 'ตามรอยที่มาของตัวเลข', en: 'Tracing where a number came from', zh: '追溯数字来源' },
        summary: {
          th: 'ทุกยอดในงบย้อนกลับไปหาเอกสารต้นทางได้',
          en: 'Every figure in the statements traces back to its source document',
          zh: '报表中的每个数字都可追溯到原始单据',
        },
        steps: [
          { th: 'ในรายงาน กดที่ตัวเลขเพื่อเจาะดูรายการที่ประกอบกันเป็นยอดนั้น', en: 'In a report, click a figure to drill into the entries that make it up.', zh: '在报表中点击数字，可下钻查看构成该金额的记录。' },
          { th: 'เปิดเอกสารแล้วกดดูที่มา จะเห็นทั้งสายว่าใบนี้มาจากใบไหน และลงบัญชีอะไรไว้บ้าง', en: 'Open a document and view its provenance to see the whole chain and every posting it produced.', zh: '打开单据查看溯源，可见完整链路及其产生的所有分录。' },
        ],
        tips: [
          { th: 'ใช้ตอนผู้สอบบัญชีถาม จะตอบได้ทันทีว่าเลขมาจากไหน ไม่ต้องรื้อแฟ้ม', en: 'Useful when auditors ask — you can answer immediately without digging through files.', zh: '审计问询时可即刻作答，无需翻找纸质档案。' },
        ],
        resource: 'documents',
      },
    ],
  },

  /* ─────────────────────────── สินค้าและสินทรัพย์ ─────────────────────────── */
  {
    slug: 'stock', icon: 'Package',
    title: { th: 'สินค้าและสินทรัพย์', en: 'Stock and assets', zh: '库存与资产' },
    summary: {
      th: 'สินค้าคงคลังแบบเข้าก่อนออกก่อน และค่าเสื่อมสินทรัพย์',
      en: 'FIFO inventory and asset depreciation',
      zh: '先进先出库存与资产折旧',
    },
    articles: [
      {
        slug: 'stock-basics',
        title: { th: 'ตั้งสินค้าและยอดยกมา', en: 'Setting up products and opening stock', zh: '设置商品与期初库存' },
        summary: {
          th: 'ตั้งให้ถูกตั้งแต่แรก ต้นทุนขายจะถูกต้องเอง',
          en: 'Get this right at the start and cost of sales takes care of itself',
          zh: '一开始设置正确，销售成本便会自动准确',
        },
        steps: [
          { th: 'สร้างสินค้าพร้อมระบุว่าติดตามสต๊อกหรือไม่ บริการไม่ต้องติดตาม', en: 'Create the product and say whether stock is tracked — services are not tracked.', zh: '创建商品并指明是否跟踪库存，服务类无需跟踪。' },
          { th: 'บันทึกยอดยกมาด้วยการปรับปรุงสต๊อก ใส่จำนวนและต้นทุนต่อหน่วยตามจริง', en: 'Enter opening balances through a stock adjustment with the real quantity and unit cost.', zh: '通过库存调整录入期初数量与实际单位成本。' },
          { th: 'ผูกบัญชีรายได้ ต้นทุนขาย และสินค้าคงเหลือ ให้ตรงกับผังบัญชี', en: 'Map the income, cost-of-sales and inventory accounts to your chart of accounts.', zh: '将收入、销售成本与存货科目与会计科目表对应。' },
        ],
        tips: [
          { th: 'ระบบคิดต้นทุนแบบเข้าก่อน-ออกก่อน และตัดต้นทุนขายอัตโนมัติเมื่ออนุมัติเอกสารขาย', en: 'Costing is FIFO, and cost of sales posts automatically when a sales document is approved.', zh: '采用先进先出计价，销售单审核后自动结转销售成本。' },
        ],
        href: '/products',
        resource: 'products',
      },
      {
        slug: 'assets',
        title: { th: 'สินทรัพย์ถาวรและค่าเสื่อม', en: 'Fixed assets and depreciation', zh: '固定资产与折旧' },
        summary: {
          th: 'คิดค่าเสื่อมรายเดือนและลงบัญชีให้อัตโนมัติ',
          en: 'Monthly depreciation, posted for you',
          zh: '按月计提折旧并自动过账',
        },
        steps: [
          { th: 'เพิ่มสินทรัพย์พร้อมราคาทุน มูลค่าซาก วันเริ่มใช้งาน และอายุการใช้งาน', en: 'Add the asset with its cost, salvage value, in-service date and useful life.', zh: '录入资产的原值、残值、启用日期与使用年限。' },
          { th: 'สิ้นเดือนกดคิดค่าเสื่อมประจำงวด ตรวจผลการคำนวณก่อนแล้วค่อยลงบัญชี', en: 'At month end run the depreciation for the period, review the result, then post it.', zh: '月末运行本期折旧，核对结果后再过账。' },
        ],
        tips: [
          { th: 'ค่าเสื่อมที่ลงบัญชีแล้วอยู่ในงวดที่ปิดไปแล้วจะแก้ไม่ได้ ต้องปลดล็อกงวดก่อน', en: 'Depreciation posted into a closed period cannot be edited — unlock the period first.', zh: '已过账到关账期间的折旧无法修改，需先解除关账。' },
        ],
        href: '/accounting/assets',
        resource: 'accounting.assets',
      },
    ],
  },

  /* ─────────────────────────── ภาษี ─────────────────────────── */
  {
    slug: 'tax', icon: 'Receipt',
    title: { th: 'ภาษี', en: 'Tax', zh: '税务' },
    summary: {
      th: 'ภาษีมูลค่าเพิ่ม ภาษีหัก ณ ที่จ่าย และใบกำกับภาษีอิเล็กทรอนิกส์',
      en: 'VAT, withholding tax and e-Tax invoices',
      zh: '增值税、预扣所得税与电子发票',
    },
    articles: [
      {
        slug: 'vat',
        title: { th: 'รายงานภาษีซื้อ-ขาย และ ภ.พ.30', en: 'Input/output VAT reports and PP.30', zh: '进销项增值税报表与 PP.30' },
        summary: {
          th: 'ยอดมาจากเอกสารจริง ไม่ต้องกรอกซ้ำ',
          en: 'Figures come from actual documents — nothing is retyped',
          zh: '数据来自实际单据，无需重复录入',
        },
        steps: [
          { th: 'เลือกเดือนภาษีที่ต้องการ ระบบจะรวมยอดจากเอกสารที่อนุมัติแล้วในเดือนนั้น', en: 'Pick the tax month — approved documents in that month are totalled for you.', zh: '选择税务月份，系统汇总该月已审核单据。' },
          { th: 'ตรวจรายการที่เข้าเงื่อนไขก่อนยื่น โดยเฉพาะใบที่เลขผู้เสียภาษีไม่ครบ', en: 'Review the lines before filing, especially any missing tax IDs.', zh: '申报前复核明细，尤其是税号缺失的记录。' },
          { th: 'เปิดหน้า ภ.พ.30 เพื่อดูยอดที่ต้องกรอกในแบบยื่น', en: 'Open the PP.30 screen to see the amounts to enter on the filing form.', zh: '打开 PP.30 页面查看申报表需填写的金额。' },
        ],
        href: '/tax/pp30',
        resource: 'tax',
      },
      {
        slug: 'wht',
        title: { th: 'ภาษีหัก ณ ที่จ่าย และหนังสือรับรอง', en: 'Withholding tax and certificates', zh: '预扣所得税与扣缴凭证' },
        summary: {
          th: 'หักตอนจ่ายเงิน แล้วออกหนังสือรับรองให้ผู้รับ',
          en: 'Withhold at payment time, then issue the certificate to the payee',
          zh: '付款时代扣，并向收款方开具凭证',
        },
        steps: [
          { th: 'ตอนบันทึกจ่ายเงิน ใส่ประเภทเงินได้และอัตราภาษีหัก ณ ที่จ่าย', en: 'When recording the payment, choose the income type and withholding rate.', zh: '登记付款时选择所得类型与扣缴率。' },
          { th: 'ออกหนังสือรับรอง (50 ทวิ) จากรายการนั้นแล้วพิมพ์ให้ผู้รับเงิน', en: 'Issue the certificate from that entry and print it for the payee.', zh: '基于该记录开具凭证并打印交给收款方。' },
        ],
        tips: [
          { th: 'ออกผิดให้ยกเลิกหนังสือรับรองแล้วออกใหม่ ระบบเก็บประวัติทั้งสองใบไว้', en: 'If issued incorrectly, cancel the certificate and issue a new one — both are kept on record.', zh: '若开具有误，作废后重新开具，两份均留存记录。' },
        ],
        href: '/tax/wht',
        resource: 'tax',
      },
    ],
  },

  /* ─────────────────────────── รายงานและปิดงวด ─────────────────────────── */
  {
    slug: 'close', icon: 'ClipboardCheck',
    title: { th: 'รายงานและปิดงวด', en: 'Reports and closing', zh: '报表与关账' },
    summary: {
      th: 'ตรวจก่อนปิด ปิดงวดแล้วล็อกตัวเลขไม่ให้แก้ย้อนหลัง',
      en: 'Check, close, and lock the numbers against back-dated edits',
      zh: '先检查后关账，锁定数字防止事后修改',
    },
    articles: [
      {
        slug: 'pre-close',
        title: { th: 'ตรวจก่อนปิดงบ', en: 'Pre-close checks', zh: '结账前检查' },
        summary: {
          th: 'ไล่เช็กจุดที่มักผิดก่อนปิดงวด',
          en: 'Walk the checks that most often catch mistakes',
          zh: '逐项排查最常出错的地方',
        },
        steps: [
          { th: 'เปิดหน้าตรวจก่อนปิดงบ ระบบจะไล่ตรวจให้ทั้งเอกสารค้างอนุมัติ ยอดที่ไม่สมดุล และรายการผิดปกติ', en: 'Open the pre-close screen — it runs through unapproved documents, out-of-balance figures and anomalies.', zh: '打开结账前检查页面，系统会排查未审核单据、不平金额与异常记录。' },
          { th: 'แก้ทีละข้อจนไม่มีข้อเตือนสีแดงเหลือ', en: 'Fix each finding until no red warnings remain.', zh: '逐项修正，直至不再有红色警告。' },
        ],
        href: '/accounting/close-check',
        resource: 'report',
      },
      {
        slug: 'freeze',
        title: { th: 'ปิดงวดและตรวจความครบถ้วน', en: 'Closing a period and verifying integrity', zh: '关账与完整性校验' },
        summary: {
          th: 'ปิดแล้วระบบเก็บลายนิ้วมือของตัวเลขไว้เทียบภายหลังได้',
          en: 'On closing, a fingerprint of the figures is stored so you can verify them later',
          zh: '关账时保存数字指纹，日后可校验是否被改动',
        },
        steps: [
          { th: 'เปิดตั้งค่า → ปิดงวด แล้วเลือกวันสุดท้ายของงวดที่ต้องการปิด', en: 'Open Settings → Period lock and choose the last day of the period to close.', zh: '打开「设置 → 期间关账」，选择要关闭期间的最后一天。' },
          { th: 'ปิดแล้วเอกสารและสมุดรายวันในงวดนั้นจะแก้ไขไม่ได้ ยกเว้นผู้มีสิทธิ์ปลดล็อก', en: 'Once closed, documents and journals in that period cannot be edited except by someone with unlock rights.', zh: '关账后该期间的单据与凭证不可修改，仅具解锁权限者除外。' },
          { th: 'กดตรวจความครบถ้วนเมื่อไรก็ได้ เพื่อดูว่าตัวเลขยังตรงกับตอนปิดหรือถูกแก้ย้อนหลัง', en: 'Run the integrity check any time to confirm the figures still match what was closed.', zh: '可随时运行完整性校验，确认数字与关账时一致。' },
        ],
        tips: [
          { th: 'ข้อบังคับนี้อยู่ที่ฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ เรียก API ตรงก็ข้ามไม่ได้', en: 'This is enforced in the database, not by hiding buttons — calling the API directly cannot bypass it.', zh: '该限制在数据库层强制执行，并非隐藏按钮，直接调用 API 也无法绕过。' },
        ],
        href: '/settings/period-lock',
        resource: 'period',
      },
    ],
  },
];

/**
 * ฟีเจอร์ที่โปรแกรมบัญชีเจ้าอื่นมีแต่ ONEBOOK ยังไม่มี
 * บอกไว้ตรง ๆ ในคู่มือ พร้อมทางออกที่ใช้ได้ตอนนี้
 */
export const GAPS: HelpGap[] = [
  {
    title: { th: 'จัดการเงินเดือน', en: 'Payroll', zh: '薪资管理' },
    detail: {
      th: 'ONEBOOK ไม่คำนวณเงินเดือน ประกันสังคม หรือ ภ.ง.ด.1 ให้',
      en: 'ONEBOOK does not calculate payroll, social security or the PND.1 form.',
      zh: 'ONEBOOK 不计算工资、社保或 PND.1 申报表。',
    },
    workaround: {
      th: 'องค์กรใช้ GoodHR อยู่แล้วซึ่งทำเงินเดือนได้ ให้บันทึกยอดรวมค่าใช้จ่ายพนักงานเข้ามาเป็นรายการค่าใช้จ่ายต่องวด',
      en: 'Your organisation already runs payroll in GoodHR — post the period total into ONEBOOK as an expense entry.',
      zh: '公司已在 GoodHR 处理薪资，可将各期合计以费用单形式录入 ONEBOOK。',
    },
  },
  {
    title: { th: 'คลังเอกสารรวมศูนย์', en: 'Central document library', zh: '集中文档库' },
    detail: {
      th: 'แนบไฟล์กับเอกสารแต่ละใบได้ แต่ยังไม่มีหน้ารวมไฟล์ทั้งหมดให้ค้นแยกจากเอกสาร',
      en: 'Files can be attached to individual documents, but there is no separate screen listing every file.',
      zh: '可为单据附加文件，但尚无独立页面集中查看全部文件。',
    },
    workaround: {
      th: 'ใช้ช่องค้นหา (⌘K) หาเอกสารต้นทางก่อน แล้วเปิดไฟล์แนบจากในเอกสารนั้น',
      en: 'Use search (⌘K) to find the source document first, then open its attachments.',
      zh: '先用搜索（⌘K）找到源单据，再打开其附件。',
    },
  },
  {
    title: { th: 'เชื่อมต่อผ่าน API และแอปมือถือ', en: 'Public API and mobile app', zh: '开放 API 与手机应用' },
    detail: {
      th: 'ยังไม่มี API สาธารณะให้ระบบอื่นเรียก และยังไม่มีแอปมือถือแยก',
      en: 'There is no public API for other systems to call, and no separate mobile app.',
      zh: '暂无供外部系统调用的开放 API，也没有独立手机应用。',
    },
    workaround: {
      th: 'หน้าจอทั้งหมดใช้บนมือถือได้ผ่านเบราว์เซอร์ ส่วนการนำข้อมูลเข้าใช้หน้านำเข้าข้อมูลแบบไฟล์ได้',
      en: 'Every screen works in a mobile browser, and bulk data can go in through the file import screen.',
      zh: '所有页面均可在手机浏览器使用，批量数据可通过文件导入页面录入。',
    },
  },
];

export const findCategory = (slug: string) => HELP.find((c) => c.slug === slug);
export const findArticle = (cat: string, slug: string) =>
  findCategory(cat)?.articles.find((a) => a.slug === slug);
