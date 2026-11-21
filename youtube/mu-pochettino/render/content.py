"""Narration segments + the visual for each. Display text = subtitle; TTS text derived by phonetic()."""
import re
from engine import *

PHON = [("Mauricio Pochettino", "Mau ri xi ô Pốt chét ti nô"), ("Pochettino", "Pốt chét ti nô"),
        ("Michael Carrick", "Mai cồn Ca rích"), ("Carrick", "Ca rích"), ("Anfield", "An phiu"),
        ("Liverpool", "Li vơ pun"), ("Aston Villa", "Ét tơn Vi la"), ("Coventry", "Cô ven tri"),
        ("Al Jazeera", "An Gia di ra"), ("Tottenham", "Tốt ten ham"), ("Champions League", "Chem pi ần Líc"),
        ("Ligue 1", "Lích Oan"), ("PSG", "Pê Ét Giê"), ("Chelsea", "Chen xi"), ("pressing", "prét xing"),
        ("2019", "hai nghìn không trăm mười chín"), ("0,8", "không phẩy tám"), ("1,14", "một phẩy mười bốn"),
        ("HLV", "huấn luyện viên"), ("…", ","), (" – ", ", ")]
def phonetic(s):
    for a, b in PHON: s = s.replace(a, b)
    return re.sub(r"\bMU\b", "Mờ U", s)

# ---------- reusable visuals ----------
def v_table(arrow=False):
    def f(c):
        league_table(c, c.cx(0.46), c.cy(0.42) - c.u(220), c.u(820), highlight_p=c.p * 2.5, arrow=1.0 if arrow and c.p > 0.3 else 0)
    return f

def v_big(text, color=WHITE, size=150, sub=None, subcol=GREY, shake=False):
    def f(c):
        dx = dy = 0
        if shake and c.p > 0.4:
            dx = math.sin(c.t * 60) * c.u(6); dy = math.cos(c.t * 47) * c.u(6)
        sc_extra = 1 + (0.35 * ease_out((c.p - 0.3) / 0.7) if shake else 0)
        k = (c.t) / 0.35
        c.text(text, c.cx() + dx, c.cy(0.42) + dy, size, color, scale=ease_back(k) * sc_extra, stroke=5)
        if sub: c.text(sub, c.cx(), c.cy(0.42) + c.u(size * 0.75), 34, subcol, bold=False, alpha=ease_out((c.t - 0.3) / 0.4))
    return f

def v_cards(items, sub=None):
    """items revealed in sequence over the segment."""
    def f(c):
        n = len(items)
        for i, it in enumerate(items):
            k = (c.p * (n + 0.5) - i) * 2
            if c.W > c.H:
                x = c.cx(0.07 + 0.86 * (i + 0.5) / n); y = c.cy(0.42); w = c.W * 0.86 / n * 0.9
            else:
                x = c.cx(); y = c.cy(0.30) + i * c.u(250); w = c.u(900)
            card(c, x, y, w, c.u(200), it, k=k)
    return f

RESULTS = [GRN] + [YEL] * 5 + [RED] * 4
def v_squares(reveal_all=False, highlight=False, word=None, convert=False):
    def f(c):
        rev = 10 if reveal_all else c.p * 14
        glow = ease_out(c.p * 2) if highlight else 0
        squares(c, c.cx(), c.cy(0.40), 110 if c.W > c.H else 72, RESULTS if not convert else [YEL, YEL, YEL], rev if not convert else 3,
                highlight=YEL if highlight else None, glow=glow, convert=(0, ease_out((c.p - 0.35) / 0.3)) if convert else None)
        if not convert:
            c.text("1 thắng · 5 hòa · 4 thua", c.cx(), c.cy(0.40) + c.u(130), 44, GREY, alpha=ease_out(rev / 10 - 0.5))
        if word: c.pop_text(word, c.cx(), c.cy(0.40) - c.u(150), 92, start=c.dur * 0.45, color=YEL, stroke=5)
    return f

def v_text(lines, size=64, color=WHITE):
    def f(c):
        n = len(lines)
        for i, l in enumerate(lines):
            k = ease_out((c.p * (n + 0.3) - i) * 2)
            c.text(l, c.cx(), c.cy(0.42) + (i - (n - 1) / 2) * c.u(size * 1.5) + c.u(30) * (1 - k), size, color, alpha=k, stroke=3)
    return f

def v_person(name, variant="neutral", slide=None, prop=None, label=None, bgname=None):
    def f(c):
        x = c.cx(0.5 if c.W < c.H else 0.36); y = c.cy(0.36)
        if slide == "in": x += (1 - ease_out(c.t / 0.6)) * c.W * 0.6
        if slide == "out" and c.p > 0.45: x -= ease_out((c.p - 0.45) / 0.3) * c.W * 0.8
        silhouette(c, x, y, 330, name, variant=variant)
        if label:
            lx = c.cx(0.72) if c.W > c.H else c.cx(); ly = c.cy(0.40) if c.W > c.H else c.cy(0.62)
            c.pop_text(label[0], lx, ly, label[2] if len(label) > 2 else 64, start=label[1], color=YEL, stroke=4)
        if prop:
            k = (c.p - prop[1]) / 0.12
            if k > 0:
                r = c.u(70) * ease_back(k)
                px = x + c.u(260) if c.W > c.H else x + c.u(280); py = y - c.u(40)
                prop[0](c, px, py, r)
    return f

def v_timeline(events, upto=None):
    def f(c):
        n = len(events)
        if c.W > c.H:
            y = c.cy(0.42); x0, x1 = c.W * 0.08, c.W * 0.92
            c.d.line([x0, y, x1, y], fill=GREY, width=int(c.u(6)))
            for i, (a, b) in enumerate(events):
                k = (c.p * (n + 0.5) - i) * 2
                if k <= 0: continue
                x = x0 + (x1 - x0) * (i + 0.5) / n
                r = c.u(22) * ease_back(k)
                c.d.ellipse([x - r, y - r, x + r, y + r], fill=RED)
                c.text(a, x, y - c.u(70), 36, WHITE, scale=ease_back(k))
                c.text(b, x, y + c.u(70), 28, GREY, bold=False, scale=ease_back(k))
        else:
            x = c.cx(0.2); y0, y1 = c.cy(0.12), c.cy(0.66)
            c.d.line([x, y0, x, y1], fill=GREY, width=int(c.u(6)))
            for i, (a, b) in enumerate(events):
                k = (c.p * (n + 0.5) - i) * 2
                if k <= 0: continue
                y = y0 + (y1 - y0) * (i + 0.5) / n
                r = c.u(22) * ease_back(k)
                c.d.ellipse([x - r, y - r, x + r, y + r], fill=RED)
                c.text(a, x + c.u(60), y - c.u(22), 40, WHITE, anchor="lm", scale=ease_back(k))
                c.text(b, x + c.u(60), y + c.u(26), 30, GREY, bold=False, anchor="lm", scale=ease_back(k))
    return f

def v_checks(items, all_green=False):
    def f(c):
        n = len(items)
        for i, it in enumerate(items):
            k = 1.0 if all_green else ease_out((c.p * (n + 0.3) - i) * 2)
            if k <= 0: continue
            y = c.cy(0.42) + (i - (n - 1) / 2) * c.u(130)
            x = c.cx(0.5) - c.u(330)
            col = GRN if all_green or k >= 1 else GREY
            c.rrect([x - c.u(40), y - c.u(40), x + c.u(40), y + c.u(40)], c.u(12), col)
            if all_green or k >= 1:
                c.d.line([x - c.u(20), y, x - c.u(5), y + c.u(18), x + c.u(22), y - c.u(18)], fill=WHITE, width=int(c.u(9)))
            c.text(it, x + c.u(80), y, 46, WHITE, anchor="lm", alpha=k)
    return f

def v_equation(lines, show_from=0):
    def f(c):
        n = len(lines)
        for i, l in enumerate(lines):
            if i < show_from: k = 1.0
            else: k = ease_out((c.p * (n - show_from + 0.4) - (i - show_from)) * 2)
            if k <= 0: continue
            col = YEL if i == n - 1 else WHITE
            # typewriter
            nchar = int(len(l) * k)
            c.text(l[:max(1, nchar)], c.cx(0.5) - c.u(380) if c.W > c.H else c.cx(0.08), c.cy(0.42) + (i - (n - 1) / 2) * c.u(120), 64, col, anchor="lm", stroke=3)
    return f

def v_bars():
    def f(c):
        base = c.cy(0.62) if c.W > c.H else c.cy(0.55); maxh = c.u(420)
        for i, (lab, val, col) in enumerate((("Hiện tại", 0.8, RED), ("Cần", 1.14, GRN))):
            k = ease_out(c.p * 2 - i * 0.4)
            x = c.cx(0.38 + i * 0.24) if c.W > c.H else c.cx(0.3 + i * 0.4)
            h = maxh * val / 1.2 * k
            c.rrect([x - c.u(90), base - h, x + c.u(90), base], c.u(12), col)
            c.text(f"{val:.2f}".replace(".", ",").replace(",80", ",8"), x, base - h - c.u(40), 52, WHITE, alpha=k)
            c.text(lab, x, base + c.u(40), 36, GREY, bold=False)
        c.text("điểm / trận", c.cx(), base + c.u(95), 30, GREY, bold=False)
    return f

def v_versus(left, right):
    def f(c):
        k1 = ease_back(c.t / 0.4); k2 = ease_back((c.t - c.dur * 0.45) / 0.4)
        if c.W > c.H:
            card(c, c.cx(0.28), c.cy(0.42), c.u(560), c.u(220), left, k=c.t / 0.4)
            card(c, c.cx(0.72), c.cy(0.42), c.u(560), c.u(220), right, k=(c.t - c.dur * 0.45) / 0.4)
            c.text("hay", c.cx(), c.cy(0.42), 46, GREY, alpha=ease_out(c.t - c.dur * 0.35))
        else:
            card(c, c.cx(), c.cy(0.28), c.u(900), c.u(220), left, k=c.t / 0.4)
            card(c, c.cx(), c.cy(0.55), c.u(900), c.u(220), right, k=(c.t - c.dur * 0.45) / 0.4)
            c.text("hay", c.cx(), c.cy(0.415), 46, GREY, alpha=ease_out(c.t - c.dur * 0.35))
    return f

def v_stopwatch():
    def f(c):
        c.text("90 phút", c.cx(), c.cy(0.18), 70, WHITE, stroke=3) if c.W < c.H else c.text("90 phút", c.cx(0.3), c.cy(0.42), 90, WHITE, stroke=3)
        x = c.cx(0.68) if c.W > c.H else c.cx(); y = c.cy(0.42)
        stopwatch(c, x, y, c.u(180), ease_out(clamp((c.p - 0.3) / 0.6)))
    return f

def v_predict(tear_on=False, pin_on=False):
    def f(c):
        y = c.cy(0.40)
        c.rrect([c.cx() - c.u(470), y - c.u(150), c.cx() + c.u(470), y + c.u(150)], c.u(24), DARK)
        c.text("Dự đoán của bạn", c.cx(), y - c.u(95), 38, GREY, bold=False)
        q = "?" if int(c.t * 2.5) % 2 == 0 else " "
        c.text(f"Liverpool  {q} – {q}  MU", c.cx(), y + c.u(20), 70, WHITE)
        if pin_on: pin(c, c.cx() + c.u(430), y - c.u(150), c.u(40) * ease_back((c.p - 0.2) / 0.2))
        if tear_on and c.p > 0.3:
            ty = y - c.u(40) + ease_out((c.p - 0.3) / 0.5) * c.u(60)
            tear(c, c.cx() + c.u(300), ty, c.u(22))
    return f

def v_pitch_press():
    def f(c):
        x0, x1 = c.cx(0.5) - c.u(420), c.cx(0.5) + c.u(420); y0, y1 = c.cy(0.42) - c.u(260), c.cy(0.42) + c.u(260)
        c.rrect([x0, y0, x1, y1], c.u(10), (26, 82, 40), outline=WHITE, width=c.u(4))
        c.d.line([x0, (y0 + y1) / 2, x1, (y0 + y1) / 2], fill=WHITE, width=int(c.u(3)))
        ball = (c.cx(0.5) + c.u(60), y0 + c.u(70))
        c.d.ellipse([ball[0] - c.u(14), ball[1] - c.u(14), ball[0] + c.u(14), ball[1] + c.u(14)], fill=WHITE)
        k = ease_out(c.p * 1.6)
        for i in range(4):
            sx = x0 + c.u(150) + i * c.u(180); sy = y1 - c.u(80) - k * c.u(250)
            c.d.ellipse([sx - c.u(22), sy - c.u(22), sx + c.u(22), sy + c.u(22)], fill=RED)
            c.d.line([sx, sy - c.u(30), sx, sy - c.u(90)], fill=YEL, width=int(c.u(6)))
            c.d.polygon([(sx - c.u(14), sy - c.u(85)), (sx + c.u(14), sy - c.u(85)), (sx, sy - c.u(108))], fill=YEL)
        c.text("PRESSING", c.cx(), y0 - c.u(50), 56, YEL, stroke=3)
    return f

def v_hourglass():
    def f(c):
        hourglass(c, c.cx(0.5), c.cy(0.40), c.u(190), clamp(c.p))
        c.text("THỜI GIAN", c.cx(), c.cy(0.40) + c.u(260), 56, YEL, stroke=3)
    return f

def v_countdown(n=4):
    def f(c):
        sc = 1 + 0.06 * math.sin(c.t * 8)
        c.text(str(n), c.cx(), c.cy(0.36), 300, YEL, scale=ease_back(c.t / 0.35) * sc, stroke=6)
        c.text("NGÀY", c.cx(), c.cy(0.36) + c.u(210), 80, WHITE, scale=ease_back((c.t - 0.15) / 0.35), stroke=4)
    return f

def v_anfield(title="ANFIELD", sub="Liverpool – MU · 22/11"):
    def f(c):
        c.pop_text(title, c.cx(), c.cy(0.36), 130, start=0.0, color=WHITE, stroke=6)
        c.text(sub, c.cx(), c.cy(0.36) + c.u(120), 46, YEL, alpha=ease_out((c.t - 0.3) / 0.4), stroke=3)
    return f

def v_badge():
    def f(c):
        if cutout("Carrick"): silhouette(c, c.cx(0.36) - ease_out((c.p - 0.1) / 0.35) * c.W * 0.8, c.cy(0.36), 330, "Carrick")
        k = (c.p - 0.5) / 0.15
        if k > 0:
            star(c, c.cx(), c.cy(0.30), c.u(110) * ease_back(k))
            c.text("KINH NGHIỆM", c.cx(), c.cy(0.30) + c.u(170), 80, YEL, scale=ease_back(k), stroke=4)
    return f

def v_line_divide():
    def f(c):
        y = c.cy(0.42); k = ease_out(c.p * 2)
        c.d.line([c.cx() - c.u(450) * k, y, c.cx() + c.u(450) * k, y], fill=WHITE, width=int(c.u(6)))
        c.text("TRỤ HẠNG", c.cx(), y - c.u(80), 64, GRN, alpha=k, stroke=3)
        c.text("XUỐNG HẠNG", c.cx(), y + c.u(80), 64, RED, alpha=k, stroke=3)
    return f

# ---------- narration ----------
# (display text, visual, background, sfx) ; sfx = list of (fraction_of_segment, kind)
BEATS = [
  ("hook", [
    ("Các bạn đã thấy MU thua nhiều rồi.", v_table(), "grid", [(0.0, "whoosh")]),
    ("Nhưng chưa bao giờ như thế này: 8 điểm sau 10 trận, đứng thứ 18,", v_big("8 ĐIỂM", RED, 190, "sau 10 trận · hạng 18"), "dark", [(0.02, "boom")]),
    ("và trận tiếp theo là Anfield.", v_anfield(), "anfield", [(0.0, "whoosh")]),
    ("Tại sao?", v_big("TẠI SAO?", YEL, 170), "dark", [(0.0, "pop")]),
  ]),
  ("turn", [
    ("Video này trả lời ba câu hỏi: MU rơi xuống đây bằng cách nào, Pochettino là ai, và cần bao nhiêu điểm để thoát.",
     v_cards(["Rơi thế nào?", "Pochettino?", "Cần bao nhiêu điểm?"]), "grid", []),
    ("Nếu các bạn là fan MU, xin chia buồn.", v_person("Fan MU", "headinhands", prop=(flower, 0.45)), "dark", [(0.45, "pop")]),
    ("Nếu không phải, xin mời ngồi xuống.", v_person(None, "neutral", prop=(popcorn, 0.35), label=("MỜI NGỒI", 0.2)), "dark", [(0.35, "pop")]),
  ]),
  ("b1", [
    ("Sau 10 vòng, MU thắng 1 trận, hòa 5 trận, thua 4 trận, hiệu số âm 5.", v_squares(), "grid", []),
    ("MU đứng thứ 18, kém Coventry, đội đứng ngay trên vùng xuống hạng, đúng 1 điểm.", v_table(arrow=True), "grid", []),
    ("Theo Al Jazeera, đây là khởi đầu tệ nhất của MU ở giải vô địch trong 40 năm.", v_big("TỆ NHẤT 40 NĂM", RED, 120, "nguồn: Al Jazeera, 13/11/2026"), "dark", [(0.05, "boom")]),
    ("Con số đáng chú ý nhất là 5 trận hòa.", v_squares(True, True), "grid", []),
    ("MU không bị đè bẹp.", v_text(["Không bị đè bẹp."], 80), "grid", []),
    ("Nói cách khác, MU không thua.", v_text(["Nói cách khác…", "MU không thua."], 80), "grid", []),
    ("MU chỉ… không thắng.", v_squares(True, True), "grid", []),
    ("Rất nhiều lần.", v_squares(True, True, word="RẤT NHIỀU LẦN"), "grid", [(0.45, "pop")]),
  ]),
  ("b2", [
    ("Ngày 12 tháng 11, MU sa thải HLV Michael Carrick.", (v_person("Carrick", label=("12/11 · SA THẢI", 0.6)) if cutout("Carrick") else v_big("SA THẢI", RED, 170, "Michael Carrick · 12/11", subcol=WHITE)), "oldtrafford", [(0.1, "whoosh")]),
    ("Trận cuối cùng của ông là gặp Aston Villa.", v_cards(["Trận cuối: Aston Villa"]), "oldtrafford", []),
    ("Câu hỏi công bằng là: thay HLV giữa mùa có phải là giải pháp không, hay chỉ là cách nhanh nhất để mua thời gian?",
     v_versus("Giải pháp?", "Mua thời gian?"), "grid", []),
    ("MU đã thử cách này vài lần rồi, nên ít nhất về khoản sa thải HLV, họ có kinh nghiệm.", v_badge(), "oldtrafford", [(0.5, "pop")]),
  ]),
  ("b3", [
    ("HLV mới là Mauricio Pochettino.", v_person("Pochettino", slide="in"), "grid", [(0.0, "whoosh")]),
    ("Ông từng đưa Tottenham vào chung kết Champions League năm 2019, vô địch Ligue 1 cùng PSG, dẫn dắt Chelsea một mùa, rồi nhận đội tuyển Mỹ.",
     v_timeline([("Tottenham", "chung kết C1 2019"), ("PSG", "vô địch Ligue 1"), ("Chelsea", "một mùa"), ("Tuyển Mỹ", "HLV trưởng"), ("MU", "từ 18/11")]), "grid", []),
    ("Ông được bổ nhiệm ngày 13 tháng 11 và nhận việc từ ngày 18.", v_timeline([("13/11", "bổ nhiệm"), ("18/11", "nhận việc"), ("22/11", "Anfield")]), "grid", []),
    ("Tức là ông có khoảng bốn ngày tập luyện trước trận đầu tiên.", v_countdown(), "dark", [(0.0, "boom")]),
    ("Điểm mạnh nổi tiếng nhất của Pochettino là pressing, tức dâng cao ép người cầm bóng, và thể lực.", v_pitch_press(), "grid", []),
    ("Hệ thống đó cần thời gian, mà thời gian là thứ MU đang thiếu nhất.", v_hourglass(), "dark", []),
    ("Bốn ngày.", v_countdown(), "dark", [(0.0, "pop")]),
    ("Trận ra mắt ở Anfield.", v_anfield(), "anfield", [(0.0, "whoosh")]),
    ("Chúc ông may mắn, thật lòng đấy.", v_person("Pochettino", "arms", prop=(clover, 0.35)), "grid", [(0.35, "pop")]),
  ]),
  ("b4", [
    ("Trận đầu tiên của Pochettino là trên sân Liverpool.", v_anfield("LIVERPOOL – MU", "22/11 · trận ra mắt"), "anfield", []),
    ("Hãy thực tế: không ai đánh giá một HLV qua một trận đấu sau bốn ngày làm việc.", v_text(["1 trận", "sau 4 ngày làm việc"], 76), "grid", []),
    ("Thứ đáng xem không phải là tỷ số, mà là ba dấu hiệu: đội có cùng nhau dâng lên ép đối thủ không, có giữ được thế trận sau khi bị dẫn không, và ai được chọn đá chính.",
     v_checks(["Pressing cùng nhau", "Phản ứng khi bị dẫn", "Đội hình xuất phát"]), "grid", []),
    ("Nếu MU làm được cả ba điều đó, đó là tin tốt.", v_checks(["Pressing cùng nhau", "Phản ứng khi bị dẫn", "Đội hình xuất phát"], True), "grid", []),
    ("Nếu không, thì ít nhất trận đấu cũng chỉ kéo dài 90 phút.", v_stopwatch(), "dark", [(0.3, "pop")]),
  ]),
  ("b5", [
    ("Đây là câu trả lời mà tôi đã hứa ở đầu video.", v_big("CÂU TRẢ LỜI", YEL, 130), "dark", [(0.0, "whoosh")]),
    ("Mùa giải có 38 vòng, MU đã đá 10, còn 28 trận.", v_equation(["38 − 10 = 28 trận"]), "dark", []),
    ("Mốc 40 điểm là con số người ta hay nhắc để trụ hạng an toàn.", v_big("40", WHITE, 260, "điểm · mốc trụ hạng hay được nhắc"), "dark", []),
    ("Nó không phải luật, chỉ là quy ước.", v_text(["không phải luật", "chỉ là quy ước"], 76), "dark", []),
    ("MU đang có 8 điểm, nên cần thêm 32 điểm từ 28 trận, tức khoảng 1,14 điểm mỗi trận.",
     v_equation(["38 − 10 = 28 trận", "40 − 8 = 32 điểm", "32 ÷ 28 ≈ 1,14 điểm/trận"], show_from=1), "dark", []),
    ("Hiện tại MU đang kiếm 0,8 điểm mỗi trận.", v_bars(), "dark", []),
    ("Vậy câu trả lời là: Pochettino không cần biến MU thành nhà vô địch.", v_text(["Không cần vô địch."], 84), "dark", []),
    ("Ông cần biến các trận hòa thành trận thắng, khoảng một trận trong mỗi ba trận hòa.", v_squares(convert=True), "dark", [(0.4, "pop")]),
    ("Nghe thì nhỏ, nhưng đó chính là ranh giới giữa trụ hạng và xuống hạng.", v_line_divide(), "dark", []),
    ("Mốc 40 điểm chỉ là quy ước.", v_big("40", WHITE, 260), "dark", []),
    ("Nhưng với MU năm nay, quy ước cũng bắt đầu đáng sợ rồi.", v_big("40", RED, 260, shake=True), "dark", [(0.4, "boom")]),
  ]),
  ("end", [
    ("Một câu hỏi cho các bạn: tỷ số trận Liverpool – MU ngày 22 sẽ là bao nhiêu?", v_predict(), "grid", []),
    ("Ghi dự đoán dưới phần bình luận.", v_predict(), "grid", []),
    ("Sau trận, tôi sẽ ghim bình luận đoán đúng.", v_predict(pin_on=True), "grid", [(0.2, "pop")]),
    ("Kể cả khi nó buồn.", v_predict(tear_on=True), "grid", []),
  ]),
]

# ---------- Shorts ----------
# Each: (name, new first line, on-screen text 2s, beat key, segment index range)
SHORTS = [
  # (file name, new first line, on-screen text for first 2s, beat, (start, end) segment slice, {index: replacement text})
  ("short1-5-tran-hoa", "Trước khi trách hàng thủ MU, hãy nhìn 5 trận hòa sau 10 vòng. Tại sao?", "5 HÒA. 1 THẮNG.",
   "b1", (0, 8), {5: "Nói cách khác, những trận đó MU không thua."}),
  ("short2-32-diem", "Các bạn thử tính xem: MU cần 32 điểm từ 28 trận, trước khi quá muộn. Bằng cách nào? Tôi hỏi giùm một người bạn.", "40 − 8 = ?",
   "b5", (1, 11), {}),
  ("short3-4-ngay", "Các bạn có 4 ngày trước trận Anfield để sửa một đội đang đứng thứ 18. Các bạn sẽ đổi gì đầu tiên? Pochettino đang hỏi đấy.", "4 NGÀY",
   "b3", (2, 9), {}),
]

# ---------- user-supplied photo backgrounds (used only when PHOTO_DIR has them) ----------
import os as _os
_PD = _os.environ.get("PHOTO_DIR", "")
BG_OVERRIDE = {
    "và trận tiếp theo là Anfield.": "photo:bg_stadium.jpg",
    "Trận ra mắt ở Anfield.": "photo:bg_stadium.jpg",
    "Trận đầu tiên của Pochettino là trên sân Liverpool.": "photo:bg_stadium.jpg",
    "Thứ đáng xem không phải là tỷ số": "photo:bg_stadium.jpg",
    "MU không bị đè bẹp.": "photo:bg_train3.jpg",
    "Nói cách khác, MU không thua.": "photo:bg_train3.jpg",
    "Ngày 12 tháng 11, MU sa thải": "grid",
    "Trận cuối cùng của ông là gặp Aston Villa.": "photo:bg_carrick2.jpg",
    "MU đã thử cách này vài lần rồi": "grid",
    "Câu hỏi công bằng là: thay HLV": "photo:bg_carrick1.jpg",
    "Hãy thực tế:": "photo:bg_train4.jpg",
    "Hệ thống đó cần thời gian": "photo:bg_train1.jpg",
    "Vậy câu trả lời là:": "photo:bg_train1.jpg",
}
if _PD and _os.path.isdir(_PD):
    for _name, _beat in BEATS:
        for _i, _s in enumerate(_beat):
            for _k, _bg in BG_OVERRIDE.items():
                if _s[0].startswith(_k) and (not _bg.startswith("photo:") or _os.path.exists(_os.path.join(_PD, _bg[6:]))):
                    _beat[_i] = (_s[0], _s[1], _bg, _s[3])
