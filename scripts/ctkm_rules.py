"""Bộ quy tắc gán CTKM cho từng dòng hàng BC21 — dùng chung cho ctkm.py và hanghoa.py.
Gán 1 CTKM/dòng: MUĐ > Ontop tổng > Ontop > Combo > CSGG/Thẻ TV (có CK) > Nguyên giá; group/chiến dịch/AWO theo tên CT."""
import re, unicodedata
GROUP={"BD":"CS.SN","LKMall":"MKT.KMMall","ECOM":"MKT.ECOM","EMPLOYEE":"HR.NV","(MKT.AWO)":"MKT.AWO","CSKH":"CS.MB","MCD":"MCD.DMGG","PO":"MKT.KM"}
AWO=[("Checkin MV (Follow MV)",r"follow mv"),("Xác nhận bảo hành nhận (CSKH sau mua)",r"cskh sau mua"),("Đăng ký đo khám mắt",r"đo khám mắt"),("HSSV",r"hssv"),
     ("Thu kính cũ",r"kính cũ"),("CP2",r"cp thứ 2|complete pair thứ 2|\bcp2\b"),("Bảo hành sản phẩm",r"bảo hành"),
     ("Welcome KH mới",r"welcome"),("Đăng ký ZMA",r"\bzma\b")]
nfc=lambda s: unicodedata.normalize("NFC",re.sub(r"\s+"," ",str(s or "")).strip())
def card_name(c):
    c=re.sub(r"^\d\.\s*","",c); m=re.match(r"([A-Za-z]+)(\d+)?",c)
    return "Thẻ thành viên "+(m.group(1).capitalize()+(" "+m.group(2)+"%" if m.group(2) else "") if m else c)
def assign(r):
    for code,name,grp in (("mud","mud_n","mud_ct"),("ott","ott_n","ott_ct"),("ot","ot_n","ot_ct"),("combo","combo_n","combo_ct")):
        if r[code] and r[name]: return GROUP.get(r[grp],r[grp] or "Khác"), nfc(r[name])
    if r["ck"]!=0:
        if r["csgg"]:
            n=nfc(r["csgg_n"] or r["csgg"])
            return ("CS.MB" if n.lower().startswith("thẻ thành viên") else "MCD.DMGG"), n
        if r["card"]: return "CS.MB", card_name(r["card"])
        return "Khác", "CK khác (không mã CTKM)"
    return "Full Price", "Nguyên giá (không CTKM)"
def regroup(grp,name):
    if re.search(r"kính cũ",name,re.I) and grp=="MKT.KM": return "MKT.TKC"
    if grp=="BOD": return "BOD.H" if re.search(r"\bC\.? ?Hà\b",name) else "BOD.T"
    return grp
GENERIC_HEAD=r"(giảm|voucher|vc|tặng|awo|approval|aproval|ecom|bảo hành|cashvoucher|b2b|saleevent)\b"
def ct_base(name):
    """Tên CT gốc — gom các mức giảm của cùng 1 CTKM (VD 'Follow MV - Giảm 100K…' và '… 300K…' -> 'Follow MV')."""
    n=re.sub(r"^P\d+\s+","",name.strip())
    m=re.match(r"(HSSV\d*)\b",n,re.I)
    if m: return m.group(1).upper()
    parts=re.split(r"\s+[-–]\s+|\s*:\s+",n,maxsplit=1)
    head=parts[0].strip()
    if len(parts)>1 and len(head)>=3 and not re.match(GENERIC_HEAD,head,re.I): return head
    return n
def campaign(name,grp):
    if grp=="Full Price": return "Nguyên giá"
    if grp=="CS.MB": return "Thẻ thành viên"
    if grp=="CS.SN" or re.search(r"snkh|sinh nhật kh",name,re.I): return "Sinh nhật KH"
    for fam,pat in AWO:
        if re.search(pat,name,re.I): return "AWO · "+fam
    if grp=="MCD.DMGG": return "Chính sách giá (MCD)"
    if grp=="HR.NV": return "Mua hàng nội bộ"
    if grp in("BOD.H","BOD.T","AM"): return "Duyệt giá ("+grp+")"
    parts=re.split(r"\s+[-–:]\s+",name)
    c=parts[0] if parts and not re.match(r"(giảm|voucher|vc|tặng)\b",parts[0],re.I) else name
    c=re.sub(r"^P\d+\s+","",c)               # "P4 Customer Week" -> "Customer Week"
    return c[:60]
def awo(name,grp):
    if grp=="CS.BH": return "Bảo hành sản phẩm"
    for fam,pat in AWO:
        if re.search(pat,name,re.I): return fam
    return ""
