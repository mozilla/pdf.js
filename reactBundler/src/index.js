import React, { useState } from "react";
import styles from "./index.less";
import ReactDom from "react-dom";
import { Tooltip, Button, Divider, Input, message, List, Loading } from "antd";
import { useRequest } from "ahooks";
import axios from "axios";
import { series } from "async";

const MyToolTip = () => {
  const [editor, setEditor] = useState(false);

  const Modal = () => {
    const person = {
      name: "Alice",
    };

    return (
      <div className={styles.modal}>
        <Button type="text" size="small" onClick={() => setEditor(true)}>
          批注
        </Button>
        <Divider type="vertical" />
        <Button
          type="text"
          size="small"
          onClick={() => message.success("复制成功")}
        >
          复制
        </Button>
      </div>
    );
  };

  const Editor = () => {
    return (
      <div className={styles.editor}>
        <Input.TextArea placeholder="你的批注" rows={6} />
        <div style={{ textAlign: "right", marginTop: "10px" }}>
          <Button type="text" size="small" onClick={() => setEditor(false)}>
            取消
          </Button>
          <Button type="primary" size="small">
            确定
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.wrapper}>
      <Tooltip
        title={editor ? <Editor /> : <Modal />}
        color="#80808017"
        trigger="click"
        overlayClassName={styles.tooltip}
      >
        <Button>click me</Button>
      </Tooltip>
    </div>
  );
};

const NotationList = () => {
  const api = () =>
    axios.get("/api/comment").then(res => {
      console.log(res);
      return res.data.data;
    });
  const { data, loading, run } = useRequest(api, {
    initialData: [],
    manual: true,
  });

  return (
    <div className={styles.list}>
      <Button onClick={run}>fetch</Button>
      <List
        itemLayout="horizontal"
        dataSource={data}
        loading={loading}
        renderItem={item => (
          <List.Item>
            <List.Item.Meta
              title={item.content}
              description={
                <div className={styles.comments}>
                  {item.comments}
                  <Button type="text">跳转</Button>
                </div>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
};

// ReactDom.render(<NotationList />, document.getElementById("root"));

// const render = () => ReactDom.render(<App />, document.getElementById("root"));

window.renderReact = dom => {
  ReactDom.render(<NotationList />, dom);
};
