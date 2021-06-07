import React from 'react';

class ErrorHandler extends React.Component {
  constructor(props) {
    super(props)
    this.state = { errorOccurred: false }
  }

  componentDidCatch(error, info) {
    this.setState({ errorOccurred: true })
    console.log(error, info)
  }

  render() {
    return this.state.errorOccurred ? <h1>Something went wrong! Please <a href='http://localhost:3000'>restart</a> the tool</h1> : this.props.children
  }
}

export default ErrorHandler