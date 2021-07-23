const	express = require('express'),
		router = express.Router(),
		Talkpage = require("../api/comments/talkpage.model"),
        Comment = require("../api/comments/comment.model"),
        Issue = require('../api/issue/issue.template'),
        LocalIssue = require('../api/issue/issue.local'),
		Project = require('../api/project/project.template'),
        LocalProject = require('../api/project/project.local'),
        Task = require('../api/task/task.template'),
        LocalTask = require('../api/task/task.local'),
		User = require("../api/user/user");

const { isLoggedIn } = require("../middleware");
        
router.post("/newthread/:talkpageid", isLoggedIn, async (req, res) => {
    Talkpage.findById(req.params.talkpageid, async (err, page) => {
        if(err){
            console.log(err);
            return res.redirect("back");
        }
        else{
            if(!page.threads.find(thread => {
                return thread.subject == req.body.subject
            })){
                page.threads.push({subject: req.body.subject, lastActivity: Date.now(), comments: []});
                page.save();
            }
            return res.redirect(`/talk/${req.params.talkpageid}`);
        }
    });
});
router.post("/comment/:talkpageid/:threadindex", isLoggedIn, (req, res) => {
    Talkpage.findById(req.params.talkpageid, (err, page) => {
        if(err){
            console.log(err);
            return res.send({});
        }
        else{
            User.findById(req.user._id, (err, user) => {
                if(err){
                    console.log(err);
                    return res.send({});
                }
                else if(user){
                    Comment.create({
                        text: req.body.comment,
                        author: user._id,
                        topic: req.params.talkpageid,
                        threadIndex: req.params.threadindex
                    }, (err, comment) => {
                        if(err){
                            console.log(err);
                            return res.send({});
                        }
                        else{
                            user.comments.push(comment);
                            user.save();
                            page.threads[req.params.threadindex].comments.push(comment);
                            page.threads[req.params.threadindex].lastActivity = Date.now();
                            page.save();
                            comment = comment.populate("author", c => res.send(comment));
                        }
                    });
                    
                    // console.log(`Reached the post comment route successfully! User ID is ${user._id}, and talkpage ID is ${page._id}. You are inserting ${req.body.comment}`);
                } else {
                    res.send({});
                }
            })
        }
    });
});
router.get("/comment/:id", (req, res) => {
    Comment.findById(req.params.id)
        .populate("topic")
        .exec((err, comment) => {
            if(err){
                console.log(err);
                res.send("Error finding that comment: " + err);
            }
            else if(comment){
                res.redirect(`/talk/${comment.topic._id}?thread=${comment.threadIndex}&comment=${comment.topic.threads[comment.threadIndex].comments.findIndex(c => String(comment._id) == String(c))}`)
            } else {
                res.send("Didn't find that comment");
            }
        });
});
router.get("/commentdata/:id", (req, res) => {
    Comment.findById(req.params.id)
        .populate("author")
        .exec((err, comment) => {
            if(err){
                console.log(err);
                res.send({});
            } else if(!comment){
                res.send({});
            } else {
                res.send(comment);
            }
        });
})
router.delete("/comment/:id", isLoggedIn, (req, res) => {
    Comment.findById(req.params.id)
        .populate("author")
        .populate("topic")
        .exec((err, comment) => {
        if(err){
            console.log(err);
            res.send(`Error finding comment to delete: ${err}`);
        } else if(comment){
            if(String(comment.author._id) == String(req.user._id)){
                let userCommentsIndex = comment.author.comments.findIndex(c => String(comment._id) == String(c));
                let threadCommentsIndex = comment.topic.threads[comment.threadIndex].comments.findIndex(c => String(comment._id) == String(c));
                let stringResponse = `You'll be deleting comment ${comment._id}, made by ${comment.author.username}. Index in the user's comments is ${userCommentsIndex}, and index in thread comments is ${threadCommentsIndex}`;
                comment.author.comments.splice(userCommentsIndex, 1);
                comment.topic.threads[comment.threadIndex].comments.splice(threadCommentsIndex, 1);
                comment.author.markModified("comments");
                comment.author.save();
                comment.topic.markModified("threads");
                comment.topic.save();
                Comment.findByIdAndDelete(comment._id, (err, deadComment) => {
                    if(err){
                        console.log(err);
                        stringResponse = `Error deleting the comment... ${err}`;
                    } else if(deadComment){
                        stringResponse = "Success";
                    } else {
                        stringResponse = "Couldn't find a comment to delete...";
                    }
                    res.send(stringResponse);
                });
            }
        } else {
            res.send("Couldn't find comment of yours to delete");
        }
    });
});
router.get("/pagedata/:talkpageid", (req, res) => {
    Talkpage.findById(req.params.talkpageid)
        .populate({
            path: "threads.comments",
            populate: { 
                path: "author",
                select: "username pfpLink"
            }
        })
        .exec((err, page) => {
            if(err){
                console.log(err);
                return res.send(err);
            } else{
                res.send(page);
            }
        });
});
router.get("/threaddata/:talkpageid/:threadindex", (req, res) => {
    Talkpage.findById(req.params.talkpageid)
        .populate({
            path: "threads.comments",
            populate: { 
                path: "author",
                select: "username pfpLink"
            }
        })
        .exec((err, page) => {
            if(err){
                console.log(err);
                return res.send(err);
            } else{
                res.send(page.threads[req.params.threadindex]);
            }
        });
});
router.get("/:id", async (req, res) => {
    Talkpage.findById(req.params.id, async (err, page) => {
        if(err){
            console.log(err);
            return res.send(`Trouble finding talkpage: ${err}`);
        }
        let title = "",
            rootLink = "";
        if(page.rootType == "IssueTemplate"){
            await Issue.findById(page.root, (err, issue) => {
                if(err){
                    console.log(err);
                    return res.send(`Trouble finding talkpage: ${err}`);
                }
                else{
                    title = issue.name;
                    rootLink = `/wiki/${issue._id}`;
                    let startScript = "<script>";
                    if(req.query.thread){
                        startScript += `openThreadAtIndex(${req.query.thread}`
                        if(req.query.comment){
                            startScript += `, ${req.query.comment}`
                        }
                        startScript += ");"
                    }
                    startScript += "</script>"
                    return res.render("talk/page", {
                        title: title,
                        rootLink: rootLink,
                        page: page,
                        startScript: startScript
                    });
                }
            });
        }
        else if(page.rootType == "ProjectTemplate"){
            await Project.findById(page.root, (err, project) => {
                if(err){
                    console.log(err);
                    return res.send(`Trouble finding talkpage: ${err}`);
                }
                else{
                    title = project.name;
                    rootLink = `/project/${project._id}`;
                    let startScript = "<script>";
                    if(req.query.thread){
                        startScript += `openThreadAtIndex(${req.query.thread}`
                        if(req.query.comment){
                            startScript += `, ${req.query.comment}`
                        }
                        startScript += ");"
                    }
                    startScript += "</script>"
                    return res.render("talk/page", {
                        title: title,
                        rootLink: rootLink,
                        page: page,
                        startScript: startScript
                    });
                }
            });
        }
        else {
            res.redirect("back");
        }
    });
});

module.exports = router;
