var action = **"";

<:body +[[save]]:prevent={ *action = "save" } />
<:body +[[copy]]:prevent={ *action = "copy" } />
<:body +[[paste]]:prevent={ *action = "paste" } />

<p :body +text=*action />
