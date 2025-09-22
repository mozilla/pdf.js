const COLORS = [
  "#8683FF",
  "#88C0FF",
  "#69DE98",
  "#F88",
  "#FFBB76",
  "#1BDCD7",
  "#5FE6E3",
];

class Signer {
  companyId = "";

  email = "";

  idCard = "";

  name = "";

  notifyType = "";

  organizationId = "";

  phone = "";

  signChannelType = "ONLINE";

  sortNum = 1;

  userId = "";

  color = COLORS[0];

  constructor(workflowSigner) {
    this.companyId = workflowSigner.companyId ?? "";
    this.email = workflowSigner.email ?? "";
    this.idCard = workflowSigner.idCard ?? "";
    this.name = workflowSigner.name ?? "";
    this.notifyType = workflowSigner.notifyType ?? "";
    this.organizationId = workflowSigner.organizationId ?? "";
    this.phone = workflowSigner.phone ?? "";
    this.signChannelType = workflowSigner.signChannelType ?? "ONLINE";
    this.sortNum = workflowSigner.sortNum ?? 1;
    this.userId = workflowSigner.userId ?? "";
    this.color = workflowSigner.color ?? COLORS[0];
  }

  clone() {
    return new Signer(this);
  }

  get displayName() {
    if (this.name) {
      return this.name;
    }
    return this.phone;
  }

  get label() {
    return this.displayName;
  }

  static me() {
    return new Signer({
      userId: "-1",
      name: "我",
      color: COLORS[0],
    });
  }

  static testUser() {
    return new Signer({
      userId: "100",
      name: "对方",
      color: COLORS[1],
    });
  }

  get serializable() {
    return {
      companyId: this.companyId,
      email: this.email,
      idCard: this.idCard,
      name: this.name,
      notifyType: this.notifyType,
      organizationId: this.organizationId,
      phone: this.phone,
      signChannelType: this.signChannelType,
      sortNum: this.sortNum,
      userId: this.userId,
      color: this.color,
    };
  }
}

export default Signer;
