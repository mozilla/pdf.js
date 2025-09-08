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
  email = "";
  name = "";
  organizationId = "";
  phone = "";
  signChannelType = "ONLINE";
  sortNum = 1;
  userId = ""
  color = COLORS[0];

  constructor(workflowSigner) {
    this.email = workflowSigner.email ?? ''
    this.name = workflowSigner.name ?? ''
    this.organizationId = workflowSigner.organizationId ?? ''
    this.phone = workflowSigner.phone ?? ''
    this.signChannelType = workflowSigner.signChannelType ?? 'ONLINE'
    this.sortNum = workflowSigner.sortNum ?? 1
    this.userId = workflowSigner.userId ?? ''
    this.color = workflowSigner.color ?? COLORS[0];
  }

  clone() {
    return new Signer(this)
  }

  get displayName() {
    if (this.name) {
      return this.name
    } else {
      return this.phone
    }
  }

  get label() {
    return this.displayName
  }

  static me() {
    return new Signer({
      userId: '-1',
      name: '我',
      color: COLORS[0]
    })
  }

  static testUser() {
    return new Signer({
      userId: '100',
      name: '对方',
      color: COLORS[1]
    })
  }

  isMe() {
    return this.userId === Signer.me().userId
  }

  get serializable() {
    return {
      email: this.email,
      name: this.name,
      organizationId: this.organizationId,
      phone: this.phone,
      signChannelType: this.signChannelType,
      sortNum: this.sortNum,
      userId: this.userId,
      color: this.color
    }
  }
}

export default Signer
