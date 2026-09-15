#!/usr/bin/env python3
"""Generate five Chinese PDF resumes for manual HireOS upload tests."""

from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parent
EMAIL = "tyyslj7927@gmail.com"

RESUMES = [
    {
        "filename": "01-林若晨-AI产品经理.pdf",
        "name": "林若晨",
        "title": "AI 产品经理",
        "city": "上海",
        "phone": "+86 138 2694 7318",
        "summary": "7 年 B2B SaaS 与 AI 产品经验，专注将大模型能力落地到客服、知识管理和运营场景。擅长从业务问题拆解、方案验证到规模化上线，曾负责百万级用户产品的增长与体验优化。",
        "experience": [
            ("星澜智能科技｜高级产品经理｜2022.04—至今", [
                "负责企业知识助手产品线，完成检索增强生成、工作流编排与权限体系的产品规划；服务 180 余家企业客户。",
                "牵头客服质检智能化项目，与算法、设计、交付团队协作，将人工抽检覆盖率从 8% 提升至 72%，平均处理时长降低 41%。",
                "建立 AI 功能灰度、反馈归因与评测机制，推动 6 个行业模板上线，续费客户的功能使用率提升 28%。",
            ]),
            ("云桥软件｜产品经理｜2019.07—2022.03", [
                "负责运营中台、客户画像和自动化触达能力，围绕业务目标完成需求优先级与季度路线图管理。",
            ]),
        ],
        "education": "华东理工大学｜信息管理与信息系统｜学士",
        "skills": "AI 产品规划、LLM 应用、RAG、用户研究、B 端 SaaS、数据分析、Figma、SQL",
    },
    {
        "filename": "02-周启航-AI项目经理.pdf",
        "name": "周启航",
        "title": "AI 项目经理",
        "city": "深圳",
        "phone": "+86 139 8175 4260",
        "summary": "9 年复杂项目交付经验，近 4 年负责 AI 平台与行业智能化项目。熟悉从立项、需求澄清、资源统筹到上线验收的全过程，能够在多团队协作中识别风险并保障关键节点交付。",
        "experience": [
            ("远川数字科技｜项目经理｜2021.06—至今", [
                "统筹金融知识助手项目，协调产品、算法、后端、安全与客户方 5 个团队，10 个月完成从 POC 到全量上线。",
                "搭建里程碑、风险台账和质量门禁机制，项目按期交付率由 76% 提升至 94%，上线后三个月重大缺陷为零。",
                "主导模型效果、数据合规和客户验收三类问题的闭环，支持项目在 6 家区域机构复制落地。",
            ]),
            ("智维云服务｜交付经理｜2017.08—2021.05", [
                "负责企业软件实施及持续运营，推动需求变更、培训和上线支持等跨部门协作。",
            ]),
        ],
        "education": "武汉理工大学｜项目管理｜学士",
        "skills": "项目计划、敏捷交付、风险管理、AI 项目实施、供应商管理、Jira、飞书项目、数据看板",
    },
    {
        "filename": "03-陈子墨-AI后端工程师.pdf",
        "name": "陈子墨",
        "title": "高级后端工程师｜AI 平台",
        "city": "杭州",
        "phone": "+86 137 6058 1942",
        "summary": "8 年后端研发经验，长期负责高并发服务、数据链路和 AI 应用平台建设。具备模型服务接入、检索链路、可观测性及成本治理经验，关注稳定性与工程效率。",
        "experience": [
            ("知行云计算｜高级后端工程师｜2020.09—至今", [
                "负责 AI 应用平台的服务端架构，交付模型网关、会话编排、知识库检索和用量计费等核心服务。",
                "设计异步任务与缓存分层策略，将高峰期请求 P95 从 1.9 秒降至 680 毫秒，日均稳定处理 900 万次调用。",
                "建设 OpenTelemetry 链路追踪、SLO 和自动化回滚机制，核心 API 年度可用性达到 99.96%。",
                "与算法团队完成多模型路由和评测数据回流，单次任务平均推理成本降低 32%。",
            ]),
            ("拓源网络｜后端工程师｜2017.07—2020.08", [
                "负责订单、账户和消息服务的开发与性能优化，参与容器化发布体系建设。",
            ]),
        ],
        "education": "浙江大学｜计算机科学与技术｜学士",
        "skills": "Python、Go、FastAPI、PostgreSQL、Redis、Kafka、Kubernetes、LLM Gateway、RAG、OpenTelemetry",
    },
    {
        "filename": "04-许安然-AI产品设计师.pdf",
        "name": "许安然",
        "title": "产品设计师｜AI 体验方向",
        "city": "北京",
        "phone": "+86 136 9247 6081",
        "summary": "6 年数字产品设计经验，聚焦 AI 工具、数据产品和企业协同场景。擅长将复杂能力转化为清晰、可信和可操作的体验，并能通过研究和数据验证设计效果。",
        "experience": [
            ("明途 AI｜高级产品设计师｜2021.03—至今", [
                "主导智能工作台、提示词配置和知识库管理体验设计，建立 AI 结果引用、置信提示和人工复核等交互规范。",
                "完成 20 余次企业用户访谈与可用性测试，重构任务创建流程后，首次配置成功率从 58% 提升至 84%。",
                "与产品、算法和前端共同制定组件规范，支持 4 条业务线复用，设计交付周期缩短 30%。",
            ]),
            ("北岸互动｜产品设计师｜2018.07—2021.02", [
                "负责企业服务产品的体验设计、设计系统维护与上线复盘。",
            ]),
        ],
        "education": "中国传媒大学｜数字媒体艺术｜学士",
        "skills": "Figma、设计系统、用户研究、AI 交互、信息架构、原型设计、可用性测试、数据驱动设计",
    },
    {
        "filename": "05-宋嘉言-财务运营经理.pdf",
        "name": "宋嘉言",
        "title": "财务运营经理｜AI SaaS",
        "city": "广州",
        "phone": "+86 135 7812 4609",
        "summary": "10 年财务与运营管理经验，服务过快速增长的 SaaS 与科技业务。擅长预算与滚动预测、收入成本分析、业务流程治理和跨部门经营支持。",
        "experience": [
            ("启明智能服务｜财务运营经理｜2020.01—至今", [
                "建立订阅收入、模型调用成本和客户毛利的月度经营分析机制，为管理层提供产品定价与资源投入建议。",
                "搭建年度预算、滚动预测和费用授权流程，覆盖 4 个业务单元；预算偏差由 18% 收敛至 7%。",
                "协同销售、交付和技术团队梳理合同回款与云资源成本，年度经营性现金流改善 26%。",
                "负责审计资料、税务筹划及融资尽调支持，推动财务系统与 CRM、项目系统的数据对账自动化。",
            ]),
            ("维度科技｜高级财务分析师｜2015.07—2019.12", [
                "负责预算编制、经营报表、成本归集和业务部门财务支持。",
            ]),
        ],
        "education": "暨南大学｜会计学｜学士",
        "skills": "FP&A、预算管理、滚动预测、SaaS 收入分析、成本治理、经营报表、审计协作、Excel、Power BI",
    },
]


def build_resume(resume: dict[str, object]) -> Path:
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    path = ROOT / str(resume["filename"])
    styles = getSampleStyleSheet()
    title = ParagraphStyle("resume-name", parent=styles["Title"], fontName="STSong-Light", fontSize=22, leading=28, textColor=HexColor("#172B4D"), spaceAfter=4)
    role = ParagraphStyle("resume-role", parent=styles["Normal"], fontName="STSong-Light", fontSize=11, leading=16, textColor=HexColor("#2563EB"), spaceAfter=8)
    body = ParagraphStyle("resume-body", parent=styles["BodyText"], fontName="STSong-Light", fontSize=9.5, leading=15, textColor=HexColor("#26364A"))
    heading = ParagraphStyle("resume-heading", parent=styles["Heading2"], fontName="STSong-Light", fontSize=11, leading=16, textColor=HexColor("#173B70"), spaceBefore=12, spaceAfter=4)
    employer = ParagraphStyle("resume-employer", parent=body, fontName="STSong-Light", fontSize=10, leading=14, textColor=HexColor("#172B4D"), spaceBefore=4, spaceAfter=2)
    bullet = ParagraphStyle("resume-bullet", parent=body, leftIndent=12, firstLineIndent=-8, bulletIndent=2, spaceAfter=2)
    story = [
        Paragraph(str(resume["name"]), title),
        Paragraph(str(resume["title"]), role),
        Paragraph(f"{EMAIL}　|　{resume['phone']}　|　{resume['city']}", body),
        Spacer(1, 6),
        Paragraph("职业概述", heading),
        Paragraph(str(resume["summary"]), body),
        Paragraph("工作经历", heading),
    ]
    for employer_line, bullets in resume["experience"]:
        items = [Paragraph(employer_line, employer)]
        items.extend(Paragraph(line, bullet, bulletText="•") for line in bullets)
        story.append(KeepTogether(items))
    story.extend([
        Paragraph("教育经历", heading),
        Paragraph(str(resume["education"]), body),
        Paragraph("专业技能", heading),
        Paragraph(str(resume["skills"]), body),
    ])
    doc = SimpleDocTemplate(
        str(path), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=16 * mm, bottomMargin=16 * mm, title=str(resume["name"]), author=str(resume["name"]),
    )
    doc.build(story)
    return path


if __name__ == "__main__":
    for candidate in RESUMES:
        print(build_resume(candidate))
