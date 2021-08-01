import React, { useState, useEffect } from "react";
import ReactDom from "react-dom";
import Button from '@material-ui/core/Button';
import Drawer from '@material-ui/core/Drawer';
import TextField from '@material-ui/core/TextField';
import { makeStyles } from '@material-ui/core/styles';
import { debounce, throttle } from './util';

const viewerContainer = document.getElementById("viewerContainer") 

const useStyles = makeStyles({
  paper: {
    padding: '20px',
    paddingTop: '40px'
  },
});

const MyDrawer = () => {
  const classes = useStyles();
  const [show, setShow] = useState(false)
  const [btnShow, setBtnShow] = useState(false)
  const [pos, setPos] = useState({x: 0, y : 0})


  const onBtnClick = () => {
    setShow(true) 
  }

  const selectionListener = debounce((e) => {
    console.log(e);
    const rect = document.getSelection().getRangeAt(0).getBoundingClientRect();
    const mouseX = rect.right;
    const mouseY = rect.top;
    setPos({ x: mouseX, y: mouseY })
    setBtnShow(true)
  })

  const scrollListener = throttle(() => {
    setBtnShow(false)
  })

  useEffect(() => {
    document.addEventListener("selectionchange", selectionListener);
    viewerContainer.addEventListener("scroll", scrollListener);
    return () => {
      document.removeEventListener("selectionchange", selectionListener);
      viewerContainer.removeEventListener("scroll", scrollListener);
    }
  }, [])

  return (
    <>
      <Button
        id="commentBtn"
        style={{
          fontSize: '24px', color: 'red', position: 'fixed', 
          left: pos.x, top: pos.y, zIndex: 1,
          display: btnShow ? 'block' : 'none'
          }} 
        onClick={onBtnClick}>
          +
      </Button>
        <Drawer 
          classes={{paper: classes.paper}}
          anchor="right" 
          open={show} 
          onClose={() => setShow(false)}
        >
          <h1>write your comment</h1>
          <br/>
          <br/>
          <br/>
          <TextField
            id="outlined-textarea"
            label="comments"
            placeholder="Placeholder"
            multiline
            minRows={20}
            variant="outlined"
          />
        </Drawer>
    </>
  )
}

ReactDom.render(<MyDrawer />, document.getElementById("reactApp"));